package auth

import "golang.org/x/crypto/bcrypt"

func HashPassword(password string) (string, error) {
    hashedPassword, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
    if err != nil {
        return "", err
    }
    return string(hashedPassword), nil
}

func VerifyPassword(hashedPassword, password string) error {
    return bcrypt.CompareHashAndPassword([]byte(hashedPassword), []byte(password))
}
// dummyPasswordHash is a real bcrypt hash (DefaultCost) used to equalize login
// timing on the user-not-found path, so an attacker cannot tell "no such user"
// apart from "wrong password" by measuring response time (DISHY-10).
var dummyPasswordHash, _ = bcrypt.GenerateFromPassword([]byte("dishy-login-timing-equalizer"), bcrypt.DefaultCost)

// VerifyPasswordConstantWork performs a throwaway bcrypt comparison so the
// not-found branch spends the same CPU time as a real password check.
func VerifyPasswordConstantWork(password string) {
	_ = bcrypt.CompareHashAndPassword(dummyPasswordHash, []byte(password))
}
