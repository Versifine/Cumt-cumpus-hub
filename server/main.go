package main

import (
	"log"
	"net/http"
	"net/netip"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/Versifine/Cumt-cumpus-hub/server/auth"
	"github.com/Versifine/Cumt-cumpus-hub/server/chat"
	"github.com/Versifine/Cumt-cumpus-hub/server/community"
	"github.com/Versifine/Cumt-cumpus-hub/server/file"
	"github.com/Versifine/Cumt-cumpus-hub/server/internal/transport"
	"github.com/Versifine/Cumt-cumpus-hub/server/report"
	"github.com/Versifine/Cumt-cumpus-hub/server/store"
)

func main() {
	// -----------------------------
	// 1) 上传目录配置
	// -----------------------------
	// 读取环境变量 UPLOAD_DIR，用于指定文件上传/存储的目录。
	// - 若未设置或为空，则使用 defaultUploadDir() 推导一个默认目录。
	uploadDir := strings.TrimSpace(os.Getenv("UPLOAD_DIR"))
	if uploadDir == "" {
		uploadDir = defaultUploadDir()
	}

	// filepath.Clean 用于规范化路径（消除重复分隔符、.、.. 等）。
	uploadDir = filepath.Clean(uploadDir)

	// -----------------------------
	// 2) 依赖初始化 / “手动注入”
	// -----------------------------
	// 初始化数据存储层：支持内存 / SQLite（通过环境变量切换）。
	dataStore := mustCreateStore(uploadDir)
	if closer, ok := dataStore.(interface{ Close() error }); ok {
		defer func() { _ = closer.Close() }()
	}

	// 认证服务：依赖 store，用于登录、获取当前用户等。
	authService := &auth.Service{Store: dataStore}

	// 聊天 Hub：用于管理 WebSocket 连接、广播消息等（典型的 hub-and-spoke 结构）。
	chatHub := chat.NewHub()

	// -----------------------------
	// 3) 初始化各业务 Handler
	// -----------------------------
	// 社区模块 Handler：依赖 store（数据读写）和 Auth（鉴权/当前用户信息）。
	communityHandler := &community.Handler{Store: dataStore, Auth: authService}

	// 聊天模块 Handler：依赖 store（消息/会话数据等）和 Hub（WS 连接管理）。
	chatHandler := &chat.Handler{Store: dataStore, Hub: chatHub}

	reportHandler := &report.Handler{Store: dataStore, Auth: authService}

	// 文件模块 Handler：依赖 store、鉴权服务，以及上传目录配置。
	fileHandler := &file.Handler{
		Store:     dataStore,
		Auth:      authService,
		UploadDir: uploadDir,
	}

	// -----------------------------
	// 4) 路由注册（http.ServeMux）
	// -----------------------------
	// 使用标准库 ServeMux 作为路由器（按前缀匹配规则派发请求）。
	mux := http.NewServeMux()

	// 健康检查接口：用于容器探活/负载均衡健康检查。
	// 返回 JSON：{"status":"ok"}。
	mux.HandleFunc("/healthz", func(w http.ResponseWriter, r *http.Request) {
		transport.WriteJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	})

	// -----------------------------
	// 5) REST API：认证相关
	// -----------------------------
	mux.HandleFunc("/api/v1/auth/register", authService.RegisterHandler)

	// 登录接口：由 authService 提供处理函数。
	mux.HandleFunc("/api/v1/auth/login", authService.LoginHandler)

	// 获取当前登录用户信息（通常依赖鉴权 token/cookie 等）。
	mux.HandleFunc("/api/v1/users/me", authService.MeHandler)

	// -----------------------------
	// 6) REST API：社区相关
	// -----------------------------
	// boards 列表/创建等操作（具体取决于 communityHandler.Boards 的实现）。
	mux.HandleFunc("/api/v1/boards", communityHandler.Boards)

	// posts 列表/创建等操作。
	mux.HandleFunc("/api/v1/posts", communityHandler.Posts)

	// posts 的子路由处理：
	// 这里用手写解析的方式支持类似：
	//   /api/v1/posts/{post_id}/comments
	// 若不匹配，则返回 404。
	mux.HandleFunc("/api/v1/posts/", func(w http.ResponseWriter, r *http.Request) {
		// 去掉固定前缀，剩余部分形如 "{post_id}/comments"
		trimmed := strings.Trim(strings.TrimPrefix(r.URL.Path, "/api/v1/posts/"), "/")

		// 按 "/" 切割路径段
		parts := strings.Split(trimmed, "/")

		if len(parts) == 1 && parts[0] != "" {
			communityHandler.Post(parts[0])(w, r)
			return
		}
		if len(parts) == 2 && parts[1] == "votes" {
			communityHandler.Votes(parts[0])(w, r)
			return
		}
		if len(parts) == 2 && parts[1] == "comments" {
			communityHandler.Comments(parts[0])(w, r)
			return
		}
		if len(parts) == 4 && parts[1] == "comments" && parts[3] == "votes" {
			communityHandler.CommentVotes(parts[0], parts[2])(w, r)
			return
		}
		if len(parts) == 3 && parts[1] == "comments" {
			communityHandler.Comment(parts[0], parts[2])(w, r)
			return
		}

		// 统一错误响应：404 + 业务错误码 2001 + 消息 "not found"
		transport.WriteError(w, http.StatusNotFound, 2001, "not found")
	})

	// -----------------------------
	// 7) REST API：举报与管理（P0）
	// -----------------------------
	mux.HandleFunc("/api/v1/reports", reportHandler.Create)
	mux.HandleFunc("/api/v1/admin/reports", reportHandler.AdminList)
	mux.HandleFunc("/api/v1/admin/reports/", func(w http.ResponseWriter, r *http.Request) {
		reportID := strings.Trim(strings.TrimPrefix(r.URL.Path, "/api/v1/admin/reports/"), "/")
		if reportID == "" {
			transport.WriteError(w, http.StatusNotFound, 2001, "not found")
			return
		}
		reportHandler.AdminUpdate(reportID)(w, r)
	})

	// -----------------------------
	// 7) REST API：文件上传/下载
	// -----------------------------
	// 上传接口：例如接收 multipart/form-data 或其他格式（取决于实现）。
	mux.HandleFunc("/api/v1/files", fileHandler.Upload)

	// 下载接口：通过 /files/{file_id} 访问。
	// 注意这里是前缀匹配，因此需要手动解析 file_id。
	mux.HandleFunc("/files/", func(w http.ResponseWriter, r *http.Request) {
		// 从路径中取出 file_id
		fileID := strings.TrimPrefix(r.URL.Path, "/files/")

		// fileHandler.Download(fileID) 返回一个 handler，再执行。
		fileHandler.Download(fileID)(w, r)
	})

	// -----------------------------
	// 8) WebSocket：聊天
	// -----------------------------
	// WebSocket 入口：/ws/chat
	mux.HandleFunc("/ws/chat", chatHandler.ServeWS)

	// -----------------------------
	// 9) 静态资源：前端页面
	// -----------------------------
	// 将根路径 "/" 交给静态文件服务器：
	// - apps/web 目录下的文件会被作为静态资源提供（例如 index.html、js、css）。
	// - 注意：ServeMux 的匹配规则里 "/" 会兜底匹配未被更具体路由命中的请求。
	mux.Handle("/", http.FileServer(http.Dir("apps/web")))

	// -----------------------------
	// 10) 服务监听地址配置
	// -----------------------------
	// SERVER_ADDR 用于指定监听地址，例如 ":8080" 或 "127.0.0.1:8080"
	addr := strings.TrimSpace(os.Getenv("SERVER_ADDR"))
	if addr == "" {
		// 默认监听 8080
		addr = ":8080"
	}

	// -----------------------------
	// 11) 构造 HTTP Server 并启动
	// -----------------------------
	server := &http.Server{
		Addr: addr,
		// 外层套一层 logging 中间件，用于打印请求日志。
		Handler: logging(dataStore, mux),

		// 读取请求头的超时时间，避免慢速请求头攻击（Slowloris）。
		ReadHeaderTimeout: 5 * time.Second,
	}

	log.Printf("server listening on %s", addr)
	log.Fatal(server.ListenAndServe())
}

func mustCreateStore(uploadDir string) store.API {
	path := strings.TrimSpace(os.Getenv("SQLITE_PATH"))
	if path == "" {
		path = filepath.Join("server", "storage", "dev.db")
	}
	path = filepath.Clean(path)
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		log.Fatalf("failed to create sqlite directory: %v", err)
	}

	log.Printf("storage: using sqlite database at %s", path)
	dbStore, err := store.OpenSQLite(path)
	if err != nil {
		log.Fatalf("failed to open sqlite store: %v", err)
	}
	return dbStore
}

// logging 是一个非常简单的中间件：
// 每次请求都会打印 "METHOD PATH"，然后继续交给下游 handler 处理。
func logging(dataStore store.API, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		sw := &statusWriter{ResponseWriter: w, status: http.StatusOK}
		next.ServeHTTP(sw, r)

		userID := "-"
		token := strings.TrimSpace(r.Header.Get("Authorization"))
		if strings.HasPrefix(strings.ToLower(token), "bearer ") {
			token = strings.TrimSpace(token[7:])
		} else {
			token = ""
		}
		if token != "" {
			if user, ok := dataStore.UserByToken(token); ok {
				userID = user.ID
			}
		}

		ip := clientIP(r)
		log.Printf("%s %s status=%d ip=%s user=%s dur=%s", r.Method, r.URL.Path, sw.status, ip, userID, time.Since(start))
	})
}

type statusWriter struct {
	http.ResponseWriter
	status int
}

func (w *statusWriter) WriteHeader(code int) {
	w.status = code
	w.ResponseWriter.WriteHeader(code)
}

func clientIP(r *http.Request) string {
	forwarded := strings.TrimSpace(r.Header.Get("X-Forwarded-For"))
	if forwarded != "" {
		first := strings.TrimSpace(strings.Split(forwarded, ",")[0])
		if addr, err := netip.ParseAddr(first); err == nil {
			return addr.String()
		}
		return first
	}

	hostport := strings.TrimSpace(r.RemoteAddr)
	if hostport == "" {
		return ""
	}
	if addrPort, err := netip.ParseAddrPort(hostport); err == nil {
		return addrPort.Addr().String()
	}
	if addr, err := netip.ParseAddr(hostport); err == nil {
		return addr.String()
	}
	return hostport
}

// defaultUploadDir 推导默认上传目录：
//  1. 优先使用 <repo>/server/storage：当进程工作目录在仓库根目录时，
//     server/storage 存在则使用该路径。
//  2. 否则使用 <cwd>/storage：在其他工作目录运行时也能落盘存储。
func defaultUploadDir() string {
	// 获取当前工作目录（cwd = current working directory）
	cwd, err := os.Getwd()
	if err != nil {
		// 若获取失败，退化为相对路径 "storage"
		return "storage"
	}

	// 候选路径：<cwd>/server/storage
	candidate := filepath.Join(cwd, "server", "storage")

	// 如果 candidate 存在且是目录，则认为是在仓库根目录启动，使用该目录。
	if info, err := os.Stat(candidate); err == nil && info.IsDir() {
		return candidate
	}

	// 否则使用 <cwd>/storage
	return filepath.Join(cwd, "storage")
}
