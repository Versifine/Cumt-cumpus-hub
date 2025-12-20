package transport

import (
	"encoding/json"
	"net/http"
)

type ErrorResponse struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
}

// ReadJSON decodes the request body into v.
func ReadJSON(r *http.Request, v any) error {
	decoder := json.NewDecoder(r.Body)
	return decoder.Decode(v)
}

// WriteJSON writes v as JSON with a status code.
func WriteJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	encoder := json.NewEncoder(w)
	_ = encoder.Encode(v)
}

// WriteError writes a JSON error response with a business code.
func WriteError(w http.ResponseWriter, status int, code int, message string) {
	WriteJSON(w, status, ErrorResponse{Code: code, Message: message})
}
