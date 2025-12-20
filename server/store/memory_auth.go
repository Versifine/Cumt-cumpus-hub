package store

import (
	"fmt"
	"strings"
)

func (s *Store) Register(account, password string) (string, User, error) {
	trimmedAccount := strings.TrimSpace(account)
	trimmedPassword := strings.TrimSpace(password)
	if trimmedAccount == "" || trimmedPassword == "" {
		return "", User{}, ErrInvalidInput
	}

	passwordHash, err := hashPassword(trimmedPassword)
	if err != nil {
		return "", User{}, err
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	userID, ok := s.accounts[trimmedAccount]
	if ok {
		// Allow "upgrade" for accounts created before passwords were introduced.
		if s.passwords[trimmedAccount] != "" {
			return "", User{}, ErrAccountExists
		}
		s.passwords[trimmedAccount] = passwordHash
	} else {
		s.nextUserID++
		userID = fmt.Sprintf("u_%d", s.nextUserID)
		user := User{
			ID:        userID,
			Nickname:  trimmedAccount,
			CreatedAt: now(),
		}
		s.users[userID] = user
		s.accounts[trimmedAccount] = userID
		s.passwords[trimmedAccount] = passwordHash
	}

	token, err := newToken()
	if err != nil {
		return "", User{}, err
	}

	if old := s.userTokens[userID]; old != "" {
		delete(s.tokens, old)
	}
	s.tokens[token] = userID
	s.userTokens[userID] = token

	return token, s.users[userID], nil
}

func (s *Store) Login(account, password string) (string, User, error) {
	trimmedAccount := strings.TrimSpace(account)
	trimmedPassword := strings.TrimSpace(password)
	if trimmedAccount == "" || trimmedPassword == "" {
		return "", User{}, ErrInvalidInput
	}

	s.mu.Lock()
	userID, ok := s.accounts[trimmedAccount]
	if !ok {
		s.mu.Unlock()
		return "", User{}, ErrInvalidCredentials
	}
	passwordHash := s.passwords[trimmedAccount]
	user := s.users[userID]
	s.mu.Unlock()

	if !verifyPassword(passwordHash, trimmedPassword) {
		return "", User{}, ErrInvalidCredentials
	}

	token, err := newToken()
	if err != nil {
		return "", User{}, err
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	if old := s.userTokens[userID]; old != "" {
		delete(s.tokens, old)
	}
	s.tokens[token] = userID
	s.userTokens[userID] = token

	return token, user, nil
}
