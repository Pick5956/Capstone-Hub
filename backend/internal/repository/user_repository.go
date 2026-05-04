package repository

import (
	"Project-M/internal/entity"

	"gorm.io/gorm"
)

type UserRepository struct {
	db *gorm.DB
}

func NewUserRepository(db *gorm.DB) *UserRepository {
	return &UserRepository{db: db}
}

func (r *UserRepository) FindByEmail(email string) (*entity.User, error) {
	var user entity.User
	result := r.db.Where("email = ?", email).Limit(1).Find(&user)
	if result.Error != nil {
		return nil, result.Error
	}
	if result.RowsAffected == 0 {
		return nil, gorm.ErrRecordNotFound
	}
	return &user, nil
}

func (r *UserRepository) FindById(id uint) (*entity.User, error) {
	var user entity.User
	result := r.db.Where("id = ?", id).Limit(1).Find(&user)
	if result.Error != nil {
		return nil, result.Error
	}
	if result.RowsAffected == 0 {
		return nil, gorm.ErrRecordNotFound
	}
	return &user, nil
}

func (r *UserRepository) Create(user *entity.User) error {
	return r.db.Create(user).Error
}

func (r *UserRepository) Update(user *entity.User) error {
	return r.db.Save(user).Error
}

func (r *UserRepository) UpdateProfile(user *entity.User) error {
	return r.db.Model(user).Updates(map[string]any{
		"first_name": user.FirstName,
		"last_name":  user.LastName,
		"nickname":   user.Nickname,
		"phone":      user.Phone,
	}).Error
}

func (r *UserRepository) UpdateProfileImage(id uint, imageURL string) (*entity.User, error) {
	if err := r.db.Model(&entity.User{}).Where("id = ?", id).Update("profile_image", imageURL).Error; err != nil {
		return nil, err
	}
	return r.FindById(id)
}
