package auth

import (
	"net/http"
	"strings"

	"github.com/Versifine/Cumt-cumpus-hub/server/internal/transport"
	"github.com/Versifine/Cumt-cumpus-hub/server/store"
)

type Service struct {
	Store store.API
}

type loginRequest struct {
	Account  string `json:"account"`
	Password string `json:"password"`
}

type loginResponse struct {
	Token string       `json:"token"`
	User  userResponse `json:"user"`
}

type userResponse struct {
	ID       string `json:"id"`
	Nickname string `json:"nickname"`
}

type userStatsStore interface {
	UserStats(userID string) (int, int, error)
}

// RegisterHandler handles POST /api/v1/auth/register.
func (s *Service) RegisterHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		transport.WriteError(w, http.StatusMethodNotAllowed, 2001, "method not allowed")
		return
	}

	var req loginRequest
	if err := transport.ReadJSON(r, &req); err != nil {
		transport.WriteError(w, http.StatusBadRequest, 2001, "invalid json")
		return
	}

	token, user, err := s.Store.Register(req.Account, req.Password)
	if err != nil {
		switch err {
		case store.ErrInvalidInput:
			transport.WriteError(w, http.StatusBadRequest, 2001, "missing fields")
		case store.ErrAccountExists:
			transport.WriteError(w, http.StatusConflict, 1004, "account already exists")
		default:
			transport.WriteError(w, http.StatusInternalServerError, 5000, "server error")
		}
		return
	}

	resp := loginResponse{
		Token: token,
		User: userResponse{
			ID:       user.ID,
			Nickname: user.Nickname,
		},
	}

	transport.WriteJSON(w, http.StatusOK, resp)
}

// LoginHandler handles POST /api/v1/auth/login.
func (s *Service) LoginHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		transport.WriteError(w, http.StatusMethodNotAllowed, 2001, "method not allowed")
		return
	}

	var req loginRequest
	if err := transport.ReadJSON(r, &req); err != nil {
		transport.WriteError(w, http.StatusBadRequest, 2001, "invalid json")
		return
	}

	token, user, err := s.Store.Login(req.Account, req.Password)
	if err != nil {
		switch err {
		case store.ErrInvalidInput:
			transport.WriteError(w, http.StatusBadRequest, 2001, "missing fields")
		case store.ErrInvalidCredentials:
			transport.WriteError(w, http.StatusUnauthorized, 1003, "invalid credentials")
		default:
			transport.WriteError(w, http.StatusInternalServerError, 5000, "server error")
		}
		return
	}
	resp := loginResponse{
		Token: token,
		User: userResponse{
			ID:       user.ID,
			Nickname: user.Nickname,
		},
	}

	transport.WriteJSON(w, http.StatusOK, resp)
}

// MeHandler handles GET /api/v1/users/me.
func (s *Service) MeHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		transport.WriteError(w, http.StatusMethodNotAllowed, 2001, "method not allowed")
		return
	}

	user, ok := s.RequireUser(w, r)
	if !ok {
		return
	}

	resp := struct {
		ID        string `json:"id"`
		Nickname  string `json:"nickname"`
		CreatedAt string `json:"created_at"`
	}{
		ID:        user.ID,
		Nickname:  user.Nickname,
		CreatedAt: user.CreatedAt,
	}

	transport.WriteJSON(w, http.StatusOK, resp)
}

// PublicUserHandler handles GET /api/v1/users/{id}.
func (s *Service) PublicUserHandler(userID string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			transport.WriteError(w, http.StatusMethodNotAllowed, 2001, "method not allowed")
			return
		}

		trimmedID := strings.TrimSpace(userID)
		if trimmedID == "" {
			transport.WriteError(w, http.StatusNotFound, 2001, "not found")
			return
		}

		user, ok := s.Store.GetUser(trimmedID)
		if !ok {
			transport.WriteError(w, http.StatusNotFound, 2001, "not found")
			return
		}

		postsCount, commentsCount, err := s.userStats(trimmedID)
		if err != nil {
			transport.WriteError(w, http.StatusInternalServerError, 5000, "server error")
			return
		}

		resp := struct {
			ID            string `json:"id"`
			Nickname      string `json:"nickname"`
			Avatar        string `json:"avatar"`
			Cover         string `json:"cover"`
			Bio           string `json:"bio"`
			CreatedAt     string `json:"created_at"`
			PostsCount    int    `json:"posts_count"`
			CommentsCount int    `json:"comments_count"`
		}{
			ID:            user.ID,
			Nickname:      user.Nickname,
			Avatar:        "",
			Cover:         "",
			Bio:           "",
			CreatedAt:     user.CreatedAt,
			PostsCount:    postsCount,
			CommentsCount: commentsCount,
		}

		transport.WriteJSON(w, http.StatusOK, resp)
	}
}

// RequireUser extracts the Bearer token, loads the user, and writes a 401 error on failure.
func (s *Service) RequireUser(w http.ResponseWriter, r *http.Request) (store.User, bool) {
	token := bearerToken(r)
	if token == "" {
		transport.WriteError(w, http.StatusUnauthorized, 1001, "missing token")
		return store.User{}, false
	}

	user, ok := s.Store.UserByToken(token)
	if !ok {
		transport.WriteError(w, http.StatusUnauthorized, 1001, "invalid token")
		return store.User{}, false
	}
	return user, true
}

// bearerToken parses Authorization: Bearer <token>.
func bearerToken(r *http.Request) string {
	authHeader := strings.TrimSpace(r.Header.Get("Authorization"))
	if authHeader == "" {
		return ""
	}
	if strings.HasPrefix(strings.ToLower(authHeader), "bearer ") {
		return strings.TrimSpace(authHeader[7:])
	}
	return ""
}

func (s *Service) userStats(userID string) (int, int, error) {
	if statsStore, ok := s.Store.(userStatsStore); ok {
		return statsStore.UserStats(userID)
	}

	posts := s.Store.Posts("")
	postsCount := 0
	commentsCount := 0
	for _, post := range posts {
		if post.AuthorID == userID {
			postsCount++
		}
		comments := s.Store.Comments(post.ID)
		for _, comment := range comments {
			if comment.AuthorID == userID {
				commentsCount++
			}
		}
	}
	return postsCount, commentsCount, nil
}
