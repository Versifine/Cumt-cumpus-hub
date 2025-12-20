package chat

import "sync"

type Hub struct {
	mu    sync.Mutex
	rooms map[string]map[*Client]bool
}

// NewHub creates an in-memory chat hub that manages rooms and connected clients.
func NewHub() *Hub {
	return &Hub{
		rooms: map[string]map[*Client]bool{},
	}
}

// Join adds a client to a room (and updates client.Room).
func (h *Hub) Join(room string, client *Client) {
	h.mu.Lock()
	defer h.mu.Unlock()

	if h.rooms[room] == nil {
		h.rooms[room] = map[*Client]bool{}
	}
	h.rooms[room][client] = true
	client.Room = room
}

// Leave removes a client from its current room (if any).
func (h *Hub) Leave(client *Client) {
	h.mu.Lock()
	defer h.mu.Unlock()

	room := client.Room
	if room == "" {
		return
	}
	clients := h.rooms[room]
	if clients == nil {
		return
	}
	delete(clients, client)
	if len(clients) == 0 {
		delete(h.rooms, room)
	}
	client.Room = ""
}

// Broadcast sends a message to all clients currently in the room.
func (h *Hub) Broadcast(room string, message []byte) {
	h.mu.Lock()
	roomClients := h.rooms[room]
	clients := make([]*Client, 0, len(roomClients))
	for client := range roomClients {
		clients = append(clients, client)
	}
	h.mu.Unlock()

	for _, client := range clients {
		select {
		case client.Send <- message:
		default:
		}
	}
}
