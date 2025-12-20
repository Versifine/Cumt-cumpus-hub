package chat

import (
	"encoding/json"
	"net/http"

	"github.com/gorilla/websocket"

	"github.com/Versifine/Cumt-cumpus-hub/server/internal/transport"
	"github.com/Versifine/Cumt-cumpus-hub/server/store"
)

type Handler struct {
	Store store.API
	Hub   *Hub
}

// Client represents a single WebSocket connection to a specific user.
type Client struct {
	Conn *websocket.Conn
	User store.User
	Room string
	Send chan []byte
}

type envelope struct {
	V         int             `json:"v"`
	Type      string          `json:"type"`
	RequestID string          `json:"requestId,omitempty"`
	Data      json.RawMessage `json:"data,omitempty"`
	Error     *wsError        `json:"error,omitempty"`
}

type wsError struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
}

var upgrader = websocket.Upgrader{
	// Demo mode: allow all origins. Tighten this in production.
	CheckOrigin: func(_ *http.Request) bool { return true },
}

// ServeWS handles GET /ws/chat and upgrades the connection to WebSocket.
func (h *Handler) ServeWS(w http.ResponseWriter, r *http.Request) {
	token := r.URL.Query().Get("token")
	if token == "" {
		transport.WriteError(w, http.StatusUnauthorized, 1001, "missing token")
		return
	}

	user, ok := h.Store.UserByToken(token)
	if !ok {
		transport.WriteError(w, http.StatusUnauthorized, 1001, "invalid token")
		return
	}

	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		return
	}

	client := &Client{
		Conn: conn,
		User: user,
		Send: make(chan []byte, 16),
	}

	go client.writeLoop()

	client.sendEnvelope("system.connected", "", map[string]any{
		"userId": user.ID,
	})

	for {
		var msg envelope
		if err := conn.ReadJSON(&msg); err != nil {
			break
		}

		switch msg.Type {
		case "chat.join":
			h.handleJoin(client, msg)
		case "chat.send":
			h.handleSend(client, msg)
		case "chat.history":
			h.handleHistory(client, msg)
		case "system.ping":
			client.sendEnvelope("system.pong", msg.RequestID, nil)
		default:
			client.sendError(msg.RequestID, 3001, "unknown event")
		}
	}

	h.Hub.Leave(client)
	close(client.Send)
	_ = conn.Close()
}

func (h *Handler) handleJoin(client *Client, msg envelope) {
	var req struct {
		RoomID string `json:"roomId"`
	}
	if err := json.Unmarshal(msg.Data, &req); err != nil || req.RoomID == "" {
		client.sendError(msg.RequestID, 3002, "invalid join payload")
		return
	}

	h.Hub.Leave(client)
	h.Hub.Join(req.RoomID, client)

	client.sendEnvelope("chat.joined", msg.RequestID, map[string]any{
		"roomId": req.RoomID,
	})
}

func (h *Handler) handleSend(client *Client, msg envelope) {
	var req struct {
		RoomID  string `json:"roomId"`
		Content string `json:"content"`
	}
	if err := json.Unmarshal(msg.Data, &req); err != nil || req.RoomID == "" || req.Content == "" {
		client.sendError(msg.RequestID, 3003, "invalid send payload")
		return
	}
	if client.Room != req.RoomID {
		client.sendError(msg.RequestID, 3004, "not joined")
		return
	}

	chatMsg := h.Store.AddMessage(req.RoomID, client.User.ID, req.Content)
	payload := map[string]any{
		"id":         chatMsg.ID,
		"roomId":     chatMsg.RoomID,
		"sender":     map[string]any{"id": client.User.ID, "nickname": client.User.Nickname},
		"content":    chatMsg.Content,
		"created_at": chatMsg.CreatedAt,
	}

	encoded, err := marshalEnvelope(1, "chat.message", "", payload, nil)
	if err != nil {
		return
	}
	h.Hub.Broadcast(req.RoomID, encoded)
}

func (h *Handler) handleHistory(client *Client, msg envelope) {
	var req struct {
		RoomID string `json:"roomId"`
		Limit  int    `json:"limit"`
	}
	if err := json.Unmarshal(msg.Data, &req); err != nil || req.RoomID == "" {
		client.sendError(msg.RequestID, 3005, "invalid history payload")
		return
	}

	history := h.Store.Messages(req.RoomID, req.Limit)
	items := make([]map[string]any, 0, len(history))
	for _, entry := range history {
		items = append(items, map[string]any{
			"id":         entry.ID,
			"content":    entry.Content,
			"created_at": entry.CreatedAt,
		})
	}

	client.sendEnvelope("chat.history.result", msg.RequestID, map[string]any{
		"items": items,
	})
}

func (c *Client) writeLoop() {
	for message := range c.Send {
		_ = c.Conn.WriteMessage(websocket.TextMessage, message)
	}
}

// sendEnvelope marshals and sends a success event to the client.
func (c *Client) sendEnvelope(eventType string, requestID string, data any) {
	encoded, err := marshalEnvelope(1, eventType, requestID, data, nil)
	if err != nil {
		return
	}
	c.Send <- encoded
}

// sendError marshals and sends an error event to the client.
func (c *Client) sendError(requestID string, code int, message string) {
	encoded, err := marshalEnvelope(1, "error", requestID, nil, &wsError{Code: code, Message: message})
	if err != nil {
		return
	}
	c.Send <- encoded
}

// marshalEnvelope builds the protocol envelope used by docs/ws-protocol.md.
func marshalEnvelope(version int, eventType string, requestID string, data any, errPayload *wsError) ([]byte, error) {
	var raw json.RawMessage
	if data != nil {
		encoded, err := json.Marshal(data)
		if err != nil {
			return nil, err
		}
		raw = encoded
	}
	msg := envelope{
		V:         version,
		Type:      eventType,
		RequestID: requestID,
		Data:      raw,
		Error:     errPayload,
	}
	return json.Marshal(msg)
}
