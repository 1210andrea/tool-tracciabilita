-- Reset credenziali default (eseguire sul DB esistente).
-- admin / password
-- user  / user

UPDATE users
SET password_hash = '$2a$10$2EleFFb3GfSA7BOnb1Sj4OR.Rp8E3l0HOI0kjmIZdbtU0f9elVfwe'
WHERE username = 'admin';

UPDATE users
SET password_hash = '$2a$10$c2iqxNmnCJcg0YQVu.wFAuMRIk.wl008naVCAboQt3790bjEWQ8Gu'
WHERE username = 'user';
