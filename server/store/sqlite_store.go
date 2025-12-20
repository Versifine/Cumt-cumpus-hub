package store

import (
	"database/sql"
	"errors"
	"fmt"
	"log"
	"path/filepath"
	"strings"
	"time"

	_ "modernc.org/sqlite"
)

// SQLiteStore is a demo database-backed implementation of API.
//
// It keeps the existing ID format (u_1, p_1, ...) so that the REST/WS payloads
// stay stable while we switch persistence from memory to SQLite.
type SQLiteStore struct {
	db *sql.DB
}

// OpenSQLite opens (or creates) a SQLite database at the given path and runs migrations.
func OpenSQLite(path string) (*SQLiteStore, error) {
	path = strings.TrimSpace(path)
	if path == "" {
		return nil, errors.New("sqlite path is required")
	}

	normalized := filepath.ToSlash(path)
	dsn := "file:" + normalized + "?cache=shared" +
		"&_pragma=busy_timeout(5000)" +
		"&_pragma=journal_mode(WAL)" +
		"&_pragma=foreign_keys(ON)"

	db, err := sql.Open("sqlite", dsn)
	if err != nil {
		return nil, err
	}
	db.SetMaxOpenConns(1)
	db.SetMaxIdleConns(1)

	if err := db.Ping(); err != nil {
		_ = db.Close()
		return nil, err
	}

	s := &SQLiteStore{db: db}
	if err := s.migrate(); err != nil {
		_ = db.Close()
		return nil, err
	}
	if err := s.seedBoards(); err != nil {
		_ = db.Close()
		return nil, err
	}
	return s, nil
}

func (s *SQLiteStore) Close() error {
	return s.db.Close()
}

func (s *SQLiteStore) migrate() error {
	stmts := []string{
		`CREATE TABLE IF NOT EXISTS counters (
			name TEXT PRIMARY KEY,
			value INTEGER NOT NULL
		);`,

		`CREATE TABLE IF NOT EXISTS users (
			seq INTEGER NOT NULL,
			id TEXT PRIMARY KEY,
			nickname TEXT NOT NULL,
			created_at TEXT NOT NULL
		);`,
		`CREATE TABLE IF NOT EXISTS accounts (
			account TEXT PRIMARY KEY,
			user_id TEXT NOT NULL,
			password_hash TEXT
		);`,
		`CREATE TABLE IF NOT EXISTS tokens (
			token TEXT PRIMARY KEY,
			user_id TEXT NOT NULL UNIQUE
		);`,

		`CREATE TABLE IF NOT EXISTS boards (
			seq INTEGER NOT NULL,
			id TEXT PRIMARY KEY,
			name TEXT NOT NULL,
			description TEXT NOT NULL
		);`,
		`CREATE TABLE IF NOT EXISTS posts (
			seq INTEGER NOT NULL,
			id TEXT PRIMARY KEY,
			board_id TEXT NOT NULL,
			author_id TEXT NOT NULL,
			title TEXT NOT NULL,
			content TEXT NOT NULL,
			created_at TEXT NOT NULL,
			deleted_at TEXT
		);`,
		`CREATE INDEX IF NOT EXISTS idx_posts_board_seq ON posts(board_id, seq);`,
		`CREATE TABLE IF NOT EXISTS comments (
			seq INTEGER NOT NULL,
			id TEXT PRIMARY KEY,
			post_id TEXT NOT NULL,
			parent_id TEXT,
			author_id TEXT NOT NULL,
			content TEXT NOT NULL,
			created_at TEXT NOT NULL,
			deleted_at TEXT
		);`,
		`CREATE TABLE IF NOT EXISTS post_votes (
			post_id TEXT NOT NULL,
			user_id TEXT NOT NULL,
			value INTEGER NOT NULL,
			created_at TEXT NOT NULL,
			PRIMARY KEY (post_id, user_id)
		);`,
		`CREATE TABLE IF NOT EXISTS comment_votes (
			comment_id TEXT NOT NULL,
			post_id TEXT NOT NULL,
			user_id TEXT NOT NULL,
			value INTEGER NOT NULL,
			created_at TEXT NOT NULL,
			PRIMARY KEY (comment_id, user_id)
		);`,
		`CREATE INDEX IF NOT EXISTS idx_post_votes_post ON post_votes(post_id);`,
		`CREATE INDEX IF NOT EXISTS idx_comment_votes_post ON comment_votes(post_id);`,
		`CREATE INDEX IF NOT EXISTS idx_comments_post_seq ON comments(post_id, seq);`,

		`CREATE TABLE IF NOT EXISTS files (
			seq INTEGER NOT NULL,
			id TEXT PRIMARY KEY,
			uploader_id TEXT NOT NULL,
			filename TEXT NOT NULL,
			storage_key TEXT NOT NULL,
			storage_path TEXT NOT NULL,
			created_at TEXT NOT NULL
		);`,

		`CREATE TABLE IF NOT EXISTS messages (
			seq INTEGER NOT NULL,
			id TEXT PRIMARY KEY,
			room_id TEXT NOT NULL,
			sender_id TEXT NOT NULL,
			content TEXT NOT NULL,
			created_at TEXT NOT NULL
		);`,
		`CREATE INDEX IF NOT EXISTS idx_messages_room_seq ON messages(room_id, seq);`,

		`CREATE TABLE IF NOT EXISTS reports (
			seq INTEGER NOT NULL,
			id TEXT PRIMARY KEY,
			target_type TEXT NOT NULL,
			target_id TEXT NOT NULL,
			reporter_id TEXT NOT NULL,
			reason TEXT NOT NULL,
			detail TEXT NOT NULL,
			status TEXT NOT NULL,
			action TEXT NOT NULL,
			note TEXT NOT NULL,
			handled_by TEXT NOT NULL,
			created_at TEXT NOT NULL,
			updated_at TEXT NOT NULL
		);`,
		`CREATE INDEX IF NOT EXISTS idx_reports_status_seq ON reports(status, seq);`,
	}

	for _, stmt := range stmts {
		if _, err := s.db.Exec(stmt); err != nil {
			return err
		}
	}

	// Backward compatible migration for databases created before password auth.
	if _, err := s.db.Exec(`ALTER TABLE accounts ADD COLUMN password_hash TEXT;`); err != nil {
		if !isSQLiteDuplicateColumnError(err) {
			return err
		}
	}

	// Legacy databases may contain demo tokens for accounts without passwords.
	// Drop those tokens so users must register (set a password) before using the API.
	_, _ = s.db.Exec(
		`DELETE FROM tokens
		 WHERE user_id IN (
			SELECT user_id
			FROM accounts
			WHERE password_hash IS NULL OR TRIM(password_hash) = ''
		 );`,
	)

	// Session tokens are intentionally not retained across server restarts for the demo.
	// Clearing tokens on startup forces users to login again after restart, while keeping
	// all other persisted data (posts/comments/files/etc.) intact.
	_, _ = s.db.Exec(`DELETE FROM tokens;`)

	// Backward compatible migrations for databases created before soft delete support.
	if _, err := s.db.Exec(`ALTER TABLE posts ADD COLUMN deleted_at TEXT;`); err != nil {
		if !isSQLiteDuplicateColumnError(err) {
			return err
		}
	}
	if _, err := s.db.Exec(`ALTER TABLE comments ADD COLUMN deleted_at TEXT;`); err != nil {
		if !isSQLiteDuplicateColumnError(err) {
			return err
		}
	}
	if _, err := s.db.Exec(`ALTER TABLE comments ADD COLUMN parent_id TEXT;`); err != nil {
		if !isSQLiteDuplicateColumnError(err) {
			return err
		}
	}
	return nil
}

func isSQLiteDuplicateColumnError(err error) bool {
	if err == nil {
		return false
	}
	msg := strings.ToLower(err.Error())
	return strings.Contains(msg, "duplicate column") || strings.Contains(msg, "already exists")
}

func isSQLiteConstraintError(err error) bool {
	if err == nil {
		return false
	}
	msg := strings.ToLower(err.Error())
	return strings.Contains(msg, "constraint") || strings.Contains(msg, "unique")
}

func nullStringOrValue(value string) any {
	if strings.TrimSpace(value) == "" {
		return nil
	}
	return value
}

func (s *SQLiteStore) seedBoards() error {
	var count int
	if err := s.db.QueryRow(`SELECT COUNT(*) FROM boards;`).Scan(&count); err != nil {
		return err
	}
	if count > 0 {
		return nil
	}

	tx, err := s.db.Begin()
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()

	boards := defaultBoards()
	for i, board := range boards {
		if _, err := tx.Exec(
			`INSERT INTO boards(seq, id, name, description) VALUES(?, ?, ?, ?);`,
			i+1,
			board.ID,
			board.Name,
			board.Description,
		); err != nil {
			return err
		}
	}
	if err := tx.Commit(); err != nil {
		return err
	}
	log.Printf("seed boards inserted")
	return nil
}

func (s *SQLiteStore) nextCounter(tx *sql.Tx, name string) (int, error) {
	if _, err := tx.Exec(`INSERT OR IGNORE INTO counters(name, value) VALUES(?, 0);`, name); err != nil {
		return 0, err
	}
	if _, err := tx.Exec(`UPDATE counters SET value = value + 1 WHERE name = ?;`, name); err != nil {
		return 0, err
	}
	var value int
	if err := tx.QueryRow(`SELECT value FROM counters WHERE name = ?;`, name).Scan(&value); err != nil {
		return 0, err
	}
	return value, nil
}

func nowRFC3339() string {
	return time.Now().UTC().Format(time.RFC3339)
}

func (s *SQLiteStore) rotateToken(tx *sql.Tx, userID string) (string, error) {
	if _, err := tx.Exec(`DELETE FROM tokens WHERE user_id = ?;`, userID); err != nil {
		return "", err
	}

	var lastErr error
	for i := 0; i < 3; i++ {
		token, err := newToken()
		if err != nil {
			return "", err
		}
		if _, err := tx.Exec(`INSERT INTO tokens(token, user_id) VALUES(?, ?);`, token, userID); err != nil {
			lastErr = err
			if isSQLiteConstraintError(err) {
				continue
			}
			return "", err
		}
		return token, nil
	}
	if lastErr == nil {
		lastErr = errors.New("failed to generate token")
	}
	return "", lastErr
}

func (s *SQLiteStore) Register(account, password string) (string, User, error) {
	tx, err := s.db.Begin()
	if err != nil {
		return "", User{}, err
	}
	defer func() { _ = tx.Rollback() }()

	trimmedAccount := strings.TrimSpace(account)
	trimmedPassword := strings.TrimSpace(password)
	if trimmedAccount == "" || trimmedPassword == "" {
		return "", User{}, ErrInvalidInput
	}

	passwordHash, err := hashPassword(trimmedPassword)
	if err != nil {
		return "", User{}, err
	}

	var userID string
	var storedHash sql.NullString
	err = tx.QueryRow(`SELECT user_id, password_hash FROM accounts WHERE account = ?;`, trimmedAccount).
		Scan(&userID, &storedHash)
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		return "", User{}, err
	}

	var user User
	if errors.Is(err, sql.ErrNoRows) || userID == "" {
		seq, err := s.nextCounter(tx, "user")
		if err != nil {
			return "", User{}, err
		}
		user = User{
			ID:        fmt.Sprintf("u_%d", seq),
			Nickname:  trimmedAccount,
			CreatedAt: nowRFC3339(),
		}

		if _, err := tx.Exec(
			`INSERT INTO users(seq, id, nickname, created_at) VALUES(?, ?, ?, ?);`,
			seq,
			user.ID,
			user.Nickname,
			user.CreatedAt,
		); err != nil {
			return "", User{}, err
		}
		if _, err := tx.Exec(
			`INSERT INTO accounts(account, user_id, password_hash) VALUES(?, ?, ?);`,
			trimmedAccount,
			user.ID,
			passwordHash,
		); err != nil {
			return "", User{}, err
		}
		userID = user.ID
	} else {
		if strings.TrimSpace(storedHash.String) != "" {
			return "", User{}, ErrAccountExists
		}
		if _, err := tx.Exec(`UPDATE accounts SET password_hash = ? WHERE account = ?;`, passwordHash, trimmedAccount); err != nil {
			return "", User{}, err
		}
		if err := tx.QueryRow(`SELECT id, nickname, created_at FROM users WHERE id = ?;`, userID).
			Scan(&user.ID, &user.Nickname, &user.CreatedAt); err != nil {
			return "", User{}, err
		}
	}

	token, err := s.rotateToken(tx, userID)
	if err != nil {
		return "", User{}, err
	}

	if err := tx.Commit(); err != nil {
		return "", User{}, err
	}
	return token, user, nil
}

func (s *SQLiteStore) Login(account, password string) (string, User, error) {
	tx, err := s.db.Begin()
	if err != nil {
		return "", User{}, err
	}
	defer func() { _ = tx.Rollback() }()

	trimmedAccount := strings.TrimSpace(account)
	trimmedPassword := strings.TrimSpace(password)
	if trimmedAccount == "" || trimmedPassword == "" {
		return "", User{}, ErrInvalidInput
	}

	var (
		user         User
		passwordHash sql.NullString
	)
	err = tx.QueryRow(
		`SELECT u.id, u.nickname, u.created_at, a.password_hash
		 FROM accounts a
		 JOIN users u ON u.id = a.user_id
		 WHERE a.account = ?;`,
		trimmedAccount,
	).Scan(&user.ID, &user.Nickname, &user.CreatedAt, &passwordHash)
	if errors.Is(err, sql.ErrNoRows) {
		return "", User{}, ErrInvalidCredentials
	}
	if err != nil {
		return "", User{}, err
	}

	if !verifyPassword(strings.TrimSpace(passwordHash.String), trimmedPassword) {
		return "", User{}, ErrInvalidCredentials
	}

	token, err := s.rotateToken(tx, user.ID)
	if err != nil {
		return "", User{}, err
	}

	if err := tx.Commit(); err != nil {
		return "", User{}, err
	}
	return token, user, nil
}

func (s *SQLiteStore) UserByToken(token string) (User, bool) {
	var user User
	err := s.db.QueryRow(
		`SELECT u.id, u.nickname, u.created_at
		 FROM users u
		 JOIN tokens t ON t.user_id = u.id
		 WHERE t.token = ?;`,
		token,
	).Scan(&user.ID, &user.Nickname, &user.CreatedAt)
	if err != nil {
		return User{}, false
	}
	return user, true
}

func (s *SQLiteStore) GetUser(userID string) (User, bool) {
	var user User
	if err := s.db.QueryRow(`SELECT id, nickname, created_at FROM users WHERE id = ?;`, userID).
		Scan(&user.ID, &user.Nickname, &user.CreatedAt); err != nil {
		return User{}, false
	}
	return user, true
}

func (s *SQLiteStore) Boards() []Board {
	rows, err := s.db.Query(`SELECT id, name, description FROM boards ORDER BY seq ASC;`)
	if err != nil {
		return nil
	}
	defer rows.Close()

	var out []Board
	for rows.Next() {
		var b Board
		if err := rows.Scan(&b.ID, &b.Name, &b.Description); err != nil {
			return nil
		}
		out = append(out, b)
	}
	return out
}

func (s *SQLiteStore) GetBoard(boardID string) (Board, bool) {
	var board Board
	err := s.db.QueryRow(`SELECT id, name, description FROM boards WHERE id = ?;`, boardID).
		Scan(&board.ID, &board.Name, &board.Description)
	if err != nil {
		return Board{}, false
	}
	return board, true
}

func (s *SQLiteStore) Posts(boardID string) []Post {
	var (
		rows *sql.Rows
		err  error
	)
	if boardID == "" {
		rows, err = s.db.Query(
			`SELECT id, board_id, author_id, title, content, created_at
			 FROM posts
			 WHERE deleted_at IS NULL OR TRIM(deleted_at) = ''
			 ORDER BY seq ASC;`,
		)
	} else {
		rows, err = s.db.Query(
			`SELECT id, board_id, author_id, title, content, created_at
			 FROM posts
			 WHERE board_id = ?
			   AND (deleted_at IS NULL OR TRIM(deleted_at) = '')
			 ORDER BY seq ASC;`,
			boardID,
		)
	}
	if err != nil {
		return nil
	}
	defer rows.Close()

	var out []Post
	for rows.Next() {
		var p Post
		if err := rows.Scan(&p.ID, &p.BoardID, &p.AuthorID, &p.Title, &p.Content, &p.CreatedAt); err != nil {
			return nil
		}
		out = append(out, p)
	}
	return out
}

func (s *SQLiteStore) GetPost(postID string) (Post, bool) {
	var post Post
	var deletedAt sql.NullString
	err := s.db.QueryRow(
		`SELECT id, board_id, author_id, title, content, created_at, deleted_at
		 FROM posts
		 WHERE id = ?
		   AND (deleted_at IS NULL OR TRIM(deleted_at) = '');`,
		postID,
	).Scan(&post.ID, &post.BoardID, &post.AuthorID, &post.Title, &post.Content, &post.CreatedAt, &deletedAt)
	if err != nil {
		return Post{}, false
	}
	post.DeletedAt = strings.TrimSpace(deletedAt.String)
	return post, true
}

func (s *SQLiteStore) CreatePost(boardID, authorID, title, content string) Post {
	tx, err := s.db.Begin()
	if err != nil {
		return Post{}
	}
	defer func() { _ = tx.Rollback() }()

	seq, err := s.nextCounter(tx, "post")
	if err != nil {
		return Post{}
	}

	post := Post{
		ID:        fmt.Sprintf("p_%d", seq),
		BoardID:   boardID,
		AuthorID:  authorID,
		Title:     title,
		Content:   content,
		CreatedAt: nowRFC3339(),
	}

	if _, err := tx.Exec(
		`INSERT INTO posts(seq, id, board_id, author_id, title, content, created_at, deleted_at)
		 VALUES(?, ?, ?, ?, ?, ?, ?, NULL);`,
		seq,
		post.ID,
		post.BoardID,
		post.AuthorID,
		post.Title,
		post.Content,
		post.CreatedAt,
	); err != nil {
		return Post{}
	}

	if err := tx.Commit(); err != nil {
		return Post{}
	}
	return post
}

func (s *SQLiteStore) SoftDeletePost(postID, actorUserID string) error {
	tx, err := s.db.Begin()
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()

	var authorID string
	var deletedAt sql.NullString
	err = tx.QueryRow(`SELECT author_id, deleted_at FROM posts WHERE id = ?;`, postID).Scan(&authorID, &deletedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return ErrNotFound
	}
	if err != nil {
		return err
	}
	if strings.TrimSpace(deletedAt.String) != "" {
		return ErrNotFound
	}
	if authorID != actorUserID {
		return ErrForbidden
	}

	if _, err := tx.Exec(`UPDATE posts SET deleted_at = ? WHERE id = ?;`, nowRFC3339(), postID); err != nil {
		return err
	}
	return tx.Commit()
}

func (s *SQLiteStore) Comments(postID string) []Comment {
	rows, err := s.db.Query(
		`SELECT id, post_id, parent_id, author_id, content, created_at
		 FROM comments
		 WHERE post_id = ?
		   AND (deleted_at IS NULL OR TRIM(deleted_at) = '')
		 ORDER BY seq ASC;`,
		postID,
	)
	if err != nil {
		return nil
	}
	defer rows.Close()

	var out []Comment
	for rows.Next() {
		var c Comment
		var parentID sql.NullString
		if err := rows.Scan(&c.ID, &c.PostID, &parentID, &c.AuthorID, &c.Content, &c.CreatedAt); err != nil {
			return nil
		}
		c.ParentID = strings.TrimSpace(parentID.String)
		out = append(out, c)
	}
	return out
}

func (s *SQLiteStore) CommentCount(postID string) int {
	var count int
	err := s.db.QueryRow(
		`SELECT COUNT(1)
		 FROM comments
		 WHERE post_id = ?
		   AND (deleted_at IS NULL OR TRIM(deleted_at) = '');`,
		postID,
	).Scan(&count)
	if err != nil {
		return 0
	}
	return count
}

func (s *SQLiteStore) GetComment(postID, commentID string) (Comment, bool) {
	var comment Comment
	var deletedAt sql.NullString
	var parentID sql.NullString
	err := s.db.QueryRow(
		`SELECT id, post_id, parent_id, author_id, content, created_at, deleted_at
		 FROM comments
		 WHERE post_id = ?
		   AND id = ?
		   AND (deleted_at IS NULL OR TRIM(deleted_at) = '');`,
		postID,
		commentID,
	).Scan(&comment.ID, &comment.PostID, &parentID, &comment.AuthorID, &comment.Content, &comment.CreatedAt, &deletedAt)
	if err != nil {
		return Comment{}, false
	}
	comment.ParentID = strings.TrimSpace(parentID.String)
	comment.DeletedAt = strings.TrimSpace(deletedAt.String)
	return comment, true
}

func (s *SQLiteStore) CreateComment(postID, authorID, content, parentID string) Comment {
	tx, err := s.db.Begin()
	if err != nil {
		return Comment{}
	}
	defer func() { _ = tx.Rollback() }()

	seq, err := s.nextCounter(tx, "comment")
	if err != nil {
		return Comment{}
	}

	comment := Comment{
		ID:        fmt.Sprintf("c_%d", seq),
		PostID:    postID,
		ParentID:  parentID,
		AuthorID:  authorID,
		Content:   content,
		CreatedAt: nowRFC3339(),
	}

	if _, err := tx.Exec(
		`INSERT INTO comments(seq, id, post_id, parent_id, author_id, content, created_at, deleted_at)
		 VALUES(?, ?, ?, ?, ?, ?, ?, NULL);`,
		seq,
		comment.ID,
		comment.PostID,
		nullStringOrValue(comment.ParentID),
		comment.AuthorID,
		comment.Content,
		comment.CreatedAt,
	); err != nil {
		return Comment{}
	}

	if err := tx.Commit(); err != nil {
		return Comment{}
	}
	return comment
}

func (s *SQLiteStore) SoftDeleteComment(postID, commentID, actorUserID string) error {
	tx, err := s.db.Begin()
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()

	var authorID string
	var deletedAt sql.NullString
	err = tx.QueryRow(
		`SELECT author_id, deleted_at
		 FROM comments
		 WHERE post_id = ? AND id = ?;`,
		postID,
		commentID,
	).Scan(&authorID, &deletedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return ErrNotFound
	}
	if err != nil {
		return err
	}
	if strings.TrimSpace(deletedAt.String) != "" {
		return ErrNotFound
	}
	if authorID != actorUserID {
		return ErrForbidden
	}

	if _, err := tx.Exec(
		`UPDATE comments SET deleted_at = ? WHERE post_id = ? AND id = ?;`,
		nowRFC3339(),
		postID,
		commentID,
	); err != nil {
		return err
	}
	return tx.Commit()
}

func (s *SQLiteStore) PostScore(postID string) int {
	var score int
	err := s.db.QueryRow(
		`SELECT COALESCE(SUM(value), 0)
		 FROM post_votes
		 WHERE post_id = ?;`,
		postID,
	).Scan(&score)
	if err != nil {
		return 0
	}
	return score
}

func (s *SQLiteStore) PostVote(postID, userID string) int {
	if strings.TrimSpace(userID) == "" {
		return 0
	}
	var value int
	err := s.db.QueryRow(
		`SELECT value
		 FROM post_votes
		 WHERE post_id = ? AND user_id = ?;`,
		postID,
		userID,
	).Scan(&value)
	if errors.Is(err, sql.ErrNoRows) {
		return 0
	}
	if err != nil {
		return 0
	}
	return value
}

func (s *SQLiteStore) VotePost(postID, userID string, value int) (int, int, error) {
	if value != 1 && value != -1 {
		return 0, 0, ErrInvalidInput
	}
	if strings.TrimSpace(userID) == "" {
		return 0, 0, ErrInvalidInput
	}
	if _, ok := s.GetPost(postID); !ok {
		return 0, 0, ErrNotFound
	}

	if _, err := s.db.Exec(
		`INSERT INTO post_votes (post_id, user_id, value, created_at)
		 VALUES (?, ?, ?, ?)
		 ON CONFLICT(post_id, user_id)
		 DO UPDATE SET value = excluded.value, created_at = excluded.created_at;`,
		postID,
		userID,
		value,
		nowRFC3339(),
	); err != nil {
		return 0, 0, err
	}

	score := s.PostScore(postID)
	return score, value, nil
}

func (s *SQLiteStore) ClearPostVote(postID, userID string) (int, int, error) {
	if strings.TrimSpace(userID) == "" {
		return 0, 0, ErrInvalidInput
	}
	if _, ok := s.GetPost(postID); !ok {
		return 0, 0, ErrNotFound
	}

	if _, err := s.db.Exec(
		`DELETE FROM post_votes WHERE post_id = ? AND user_id = ?;`,
		postID,
		userID,
	); err != nil {
		return 0, 0, err
	}

	score := s.PostScore(postID)
	return score, 0, nil
}

func (s *SQLiteStore) CommentScore(postID, commentID string) int {
	var score int
	err := s.db.QueryRow(
		`SELECT COALESCE(SUM(value), 0)
		 FROM comment_votes
		 WHERE post_id = ? AND comment_id = ?;`,
		postID,
		commentID,
	).Scan(&score)
	if err != nil {
		return 0
	}
	return score
}

func (s *SQLiteStore) CommentVote(postID, commentID, userID string) int {
	if strings.TrimSpace(userID) == "" {
		return 0
	}
	var value int
	err := s.db.QueryRow(
		`SELECT value
		 FROM comment_votes
		 WHERE post_id = ? AND comment_id = ? AND user_id = ?;`,
		postID,
		commentID,
		userID,
	).Scan(&value)
	if errors.Is(err, sql.ErrNoRows) {
		return 0
	}
	if err != nil {
		return 0
	}
	return value
}

func (s *SQLiteStore) VoteComment(postID, commentID, userID string, value int) (int, int, error) {
	if value != 1 && value != -1 {
		return 0, 0, ErrInvalidInput
	}
	if strings.TrimSpace(userID) == "" {
		return 0, 0, ErrInvalidInput
	}
	if _, ok := s.GetComment(postID, commentID); !ok {
		return 0, 0, ErrNotFound
	}

	if _, err := s.db.Exec(
		`INSERT INTO comment_votes (comment_id, post_id, user_id, value, created_at)
		 VALUES (?, ?, ?, ?, ?)
		 ON CONFLICT(comment_id, user_id)
		 DO UPDATE SET value = excluded.value, post_id = excluded.post_id, created_at = excluded.created_at;`,
		commentID,
		postID,
		userID,
		value,
		nowRFC3339(),
	); err != nil {
		return 0, 0, err
	}

	score := s.CommentScore(postID, commentID)
	return score, value, nil
}

func (s *SQLiteStore) ClearCommentVote(postID, commentID, userID string) (int, int, error) {
	if strings.TrimSpace(userID) == "" {
		return 0, 0, ErrInvalidInput
	}
	if _, ok := s.GetComment(postID, commentID); !ok {
		return 0, 0, ErrNotFound
	}

	if _, err := s.db.Exec(
		`DELETE FROM comment_votes WHERE post_id = ? AND comment_id = ? AND user_id = ?;`,
		postID,
		commentID,
		userID,
	); err != nil {
		return 0, 0, err
	}

	score := s.CommentScore(postID, commentID)
	return score, 0, nil
}

func (s *SQLiteStore) SaveFile(uploaderID, filename, storageKey, storagePath string) FileMeta {
	tx, err := s.db.Begin()
	if err != nil {
		return FileMeta{}
	}
	defer func() { _ = tx.Rollback() }()

	seq, err := s.nextCounter(tx, "file")
	if err != nil {
		return FileMeta{}
	}

	file := FileMeta{
		ID:          fmt.Sprintf("f_%d", seq),
		UploaderID:  uploaderID,
		Filename:    filename,
		StorageKey:  storageKey,
		StoragePath: storagePath,
		CreatedAt:   nowRFC3339(),
	}

	if _, err := tx.Exec(
		`INSERT INTO files(seq, id, uploader_id, filename, storage_key, storage_path, created_at)
		 VALUES(?, ?, ?, ?, ?, ?, ?);`,
		seq,
		file.ID,
		file.UploaderID,
		file.Filename,
		file.StorageKey,
		file.StoragePath,
		file.CreatedAt,
	); err != nil {
		return FileMeta{}
	}

	if err := tx.Commit(); err != nil {
		return FileMeta{}
	}
	return file
}

func (s *SQLiteStore) GetFile(fileID string) (FileMeta, bool) {
	var file FileMeta
	err := s.db.QueryRow(
		`SELECT id, uploader_id, filename, storage_key, storage_path, created_at
		 FROM files
		 WHERE id = ?;`,
		fileID,
	).Scan(&file.ID, &file.UploaderID, &file.Filename, &file.StorageKey, &file.StoragePath, &file.CreatedAt)
	if err != nil {
		return FileMeta{}, false
	}
	return file, true
}

func (s *SQLiteStore) AddMessage(roomID, senderID, content string) ChatMessage {
	tx, err := s.db.Begin()
	if err != nil {
		return ChatMessage{}
	}
	defer func() { _ = tx.Rollback() }()

	seq, err := s.nextCounter(tx, "message")
	if err != nil {
		return ChatMessage{}
	}

	message := ChatMessage{
		ID:        fmt.Sprintf("m_%d", seq),
		RoomID:    roomID,
		SenderID:  senderID,
		Content:   content,
		CreatedAt: nowRFC3339(),
	}

	if _, err := tx.Exec(
		`INSERT INTO messages(seq, id, room_id, sender_id, content, created_at)
		 VALUES(?, ?, ?, ?, ?, ?);`,
		seq,
		message.ID,
		message.RoomID,
		message.SenderID,
		message.Content,
		message.CreatedAt,
	); err != nil {
		return ChatMessage{}
	}

	if err := tx.Commit(); err != nil {
		return ChatMessage{}
	}
	return message
}

func (s *SQLiteStore) Messages(roomID string, limit int) []ChatMessage {
	if strings.TrimSpace(roomID) == "" {
		return nil
	}

	query := `SELECT id, room_id, sender_id, content, created_at
			  FROM messages
			  WHERE room_id = ?
			  ORDER BY seq ASC;`
	args := []any{roomID}

	reverse := false
	if limit > 0 {
		query = `SELECT id, room_id, sender_id, content, created_at
				 FROM messages
				 WHERE room_id = ?
				 ORDER BY seq DESC
				 LIMIT ?;`
		args = []any{roomID, limit}
		reverse = true
	}

	rows, err := s.db.Query(query, args...)
	if err != nil {
		return nil
	}
	defer rows.Close()

	out := make([]ChatMessage, 0, max(limit, 0))
	for rows.Next() {
		var m ChatMessage
		if err := rows.Scan(&m.ID, &m.RoomID, &m.SenderID, &m.Content, &m.CreatedAt); err != nil {
			return nil
		}
		out = append(out, m)
	}
	if len(out) == 0 {
		return nil
	}

	if reverse {
		for i, j := 0, len(out)-1; i < j; i, j = i+1, j-1 {
			out[i], out[j] = out[j], out[i]
		}
	}
	return out
}

func (s *SQLiteStore) CreateReport(reporterID, targetType, targetID, reason, detail string) (Report, error) {
	trimmedType := strings.TrimSpace(targetType)
	trimmedID := strings.TrimSpace(targetID)
	trimmedReason := strings.TrimSpace(reason)
	trimmedDetail := strings.TrimSpace(detail)
	if trimmedType == "" || trimmedID == "" || trimmedReason == "" {
		return Report{}, ErrInvalidInput
	}

	tx, err := s.db.Begin()
	if err != nil {
		return Report{}, err
	}
	defer func() { _ = tx.Rollback() }()

	seq, err := s.nextCounter(tx, "report")
	if err != nil {
		return Report{}, err
	}

	now := nowRFC3339()
	report := Report{
		ID:         fmt.Sprintf("r_%d", seq),
		TargetType: trimmedType,
		TargetID:   trimmedID,
		ReporterID: reporterID,
		Reason:     trimmedReason,
		Detail:     trimmedDetail,
		Status:     "open",
		Action:     "",
		Note:       "",
		HandledBy:  "",
		CreatedAt:  now,
		UpdatedAt:  now,
	}

	if _, err := tx.Exec(
		`INSERT INTO reports(
			seq, id, target_type, target_id, reporter_id, reason, detail,
			status, action, note, handled_by, created_at, updated_at
		) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
		seq,
		report.ID,
		report.TargetType,
		report.TargetID,
		report.ReporterID,
		report.Reason,
		report.Detail,
		report.Status,
		report.Action,
		report.Note,
		report.HandledBy,
		report.CreatedAt,
		report.UpdatedAt,
	); err != nil {
		return Report{}, err
	}

	if err := tx.Commit(); err != nil {
		return Report{}, err
	}
	return report, nil
}

func (s *SQLiteStore) Reports(status string, page, pageSize int) ([]Report, int, error) {
	if page <= 0 {
		page = 1
	}
	if pageSize <= 0 {
		pageSize = 20
	}

	trimmed := strings.TrimSpace(status)
	var (
		total int
		err   error
	)

	if trimmed == "" {
		err = s.db.QueryRow(`SELECT COUNT(*) FROM reports;`).Scan(&total)
	} else {
		err = s.db.QueryRow(`SELECT COUNT(*) FROM reports WHERE status = ?;`, trimmed).Scan(&total)
	}
	if err != nil {
		return nil, 0, err
	}

	offset := (page - 1) * pageSize
	var rows *sql.Rows
	if trimmed == "" {
		rows, err = s.db.Query(
			`SELECT id, target_type, target_id, reporter_id, reason, detail, status, action, note, handled_by, created_at, updated_at
			 FROM reports
			 ORDER BY seq DESC
			 LIMIT ? OFFSET ?;`,
			pageSize,
			offset,
		)
	} else {
		rows, err = s.db.Query(
			`SELECT id, target_type, target_id, reporter_id, reason, detail, status, action, note, handled_by, created_at, updated_at
			 FROM reports
			 WHERE status = ?
			 ORDER BY seq DESC
			 LIMIT ? OFFSET ?;`,
			trimmed,
			pageSize,
			offset,
		)
	}
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	out := make([]Report, 0, pageSize)
	for rows.Next() {
		var r Report
		if err := rows.Scan(
			&r.ID,
			&r.TargetType,
			&r.TargetID,
			&r.ReporterID,
			&r.Reason,
			&r.Detail,
			&r.Status,
			&r.Action,
			&r.Note,
			&r.HandledBy,
			&r.CreatedAt,
			&r.UpdatedAt,
		); err != nil {
			return nil, 0, err
		}
		out = append(out, r)
	}
	return out, total, nil
}

func (s *SQLiteStore) UpdateReport(reportID, status, action, note, handledBy string) (Report, error) {
	trimmedID := strings.TrimSpace(reportID)
	trimmedStatus := strings.TrimSpace(status)
	if trimmedID == "" || trimmedStatus == "" {
		return Report{}, ErrInvalidInput
	}

	tx, err := s.db.Begin()
	if err != nil {
		return Report{}, err
	}
	defer func() { _ = tx.Rollback() }()

	now := nowRFC3339()
	res, err := tx.Exec(
		`UPDATE reports
		 SET status = ?, action = ?, note = ?, handled_by = ?, updated_at = ?
		 WHERE id = ?;`,
		trimmedStatus,
		strings.TrimSpace(action),
		strings.TrimSpace(note),
		strings.TrimSpace(handledBy),
		now,
		trimmedID,
	)
	if err != nil {
		return Report{}, err
	}
	affected, err := res.RowsAffected()
	if err == nil && affected == 0 {
		return Report{}, ErrNotFound
	}

	var r Report
	if err := tx.QueryRow(
		`SELECT id, target_type, target_id, reporter_id, reason, detail, status, action, note, handled_by, created_at, updated_at
		 FROM reports
		 WHERE id = ?;`,
		trimmedID,
	).Scan(
		&r.ID,
		&r.TargetType,
		&r.TargetID,
		&r.ReporterID,
		&r.Reason,
		&r.Detail,
		&r.Status,
		&r.Action,
		&r.Note,
		&r.HandledBy,
		&r.CreatedAt,
		&r.UpdatedAt,
	); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return Report{}, ErrNotFound
		}
		return Report{}, err
	}

	if err := tx.Commit(); err != nil {
		return Report{}, err
	}
	return r, nil
}

func max(a, b int) int {
	if a > b {
		return a
	}
	return b
}

var _ API = (*SQLiteStore)(nil)
