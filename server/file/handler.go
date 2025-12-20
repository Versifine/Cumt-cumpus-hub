package file

import (
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/Versifine/Cumt-cumpus-hub/server/auth"
	"github.com/Versifine/Cumt-cumpus-hub/server/internal/transport"
	"github.com/Versifine/Cumt-cumpus-hub/server/store"
)

type Handler struct {
	Store     store.API
	Auth      *auth.Service
	UploadDir string
}

// Upload handles POST /api/v1/files (multipart/form-data, field name: file).
func (h *Handler) Upload(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		transport.WriteError(w, http.StatusMethodNotAllowed, 2001, "method not allowed")
		return
	}

	user, ok := h.Auth.RequireUser(w, r)
	if !ok {
		return
	}

	if err := r.ParseMultipartForm(10 << 20); err != nil {
		transport.WriteError(w, http.StatusBadRequest, 2001, "invalid multipart form")
		return
	}

	file, header, err := r.FormFile("file")
	if err != nil {
		transport.WriteError(w, http.StatusBadRequest, 2001, "missing file")
		return
	}
	defer file.Close()

	filename := sanitizeFilename(header.Filename)
	if filename == "" {
		transport.WriteError(w, http.StatusBadRequest, 2001, "invalid filename")
		return
	}

	if err := os.MkdirAll(h.UploadDir, 0o755); err != nil {
		transport.WriteError(w, http.StatusInternalServerError, 5000, "failed to prepare storage")
		return
	}

	storageKey := fmt.Sprintf("%d_%s", time.Now().UTC().UnixNano(), filename)
	storagePath := filepath.Join(h.UploadDir, storageKey)

	dst, err := os.Create(storagePath)
	if err != nil {
		transport.WriteError(w, http.StatusInternalServerError, 5000, "failed to save file")
		return
	}
	defer dst.Close()

	if _, err := io.Copy(dst, file); err != nil {
		transport.WriteError(w, http.StatusInternalServerError, 5000, "failed to write file")
		return
	}

	meta := h.Store.SaveFile(user.ID, filename, storageKey, storagePath)

	resp := struct {
		ID       string `json:"id"`
		Filename string `json:"filename"`
		URL      string `json:"url"`
	}{
		ID:       meta.ID,
		Filename: meta.Filename,
		URL:      "/files/" + meta.ID,
	}

	transport.WriteJSON(w, http.StatusOK, resp)
}

// Download returns a handler for GET /files/{file_id}.
func (h *Handler) Download(fileID string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			transport.WriteError(w, http.StatusMethodNotAllowed, 2001, "method not allowed")
			return
		}

		if fileID == "" {
			transport.WriteError(w, http.StatusNotFound, 2001, "file not found")
			return
		}

		meta, ok := h.Store.GetFile(fileID)
		if !ok {
			transport.WriteError(w, http.StatusNotFound, 2001, "file not found")
			return
		}

		http.ServeFile(w, r, meta.StoragePath)
	}
}

// sanitizeFilename strips directory components and trims whitespace to prevent path traversal.
func sanitizeFilename(name string) string {
	cleaned := strings.ReplaceAll(name, "\\", "/")
	cleaned = filepath.Base(cleaned)
	cleaned = strings.TrimSpace(cleaned)
	return cleaned
}
