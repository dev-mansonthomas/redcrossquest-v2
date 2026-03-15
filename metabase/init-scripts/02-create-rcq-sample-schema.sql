-- Create sample RCQ database schema for local development
-- In production, this will be the existing Cloud SQL database

CREATE DATABASE IF NOT EXISTS rcq_fr_dev_db
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE rcq_fr_dev_db;

-- Table: ul (Unité Locale - Local Unit)
CREATE TABLE IF NOT EXISTS ul (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  code VARCHAR(50) NOT NULL UNIQUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table: queteur (Collector)
CREATE TABLE IF NOT EXISTS queteur (
  id INT AUTO_INCREMENT PRIMARY KEY,
  ul_id INT NOT NULL,
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  email VARCHAR(255),
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (ul_id) REFERENCES ul(id) ON DELETE CASCADE,
  INDEX idx_ul_id (ul_id),
  INDEX idx_active (active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table: point_quete (Collection Point)
CREATE TABLE IF NOT EXISTS point_quete (
  id INT AUTO_INCREMENT PRIMARY KEY,
  ul_id INT NOT NULL,
  name VARCHAR(255) NOT NULL,
  address TEXT,
  latitude DECIMAL(10, 8),
  longitude DECIMAL(11, 8),
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (ul_id) REFERENCES ul(id) ON DELETE CASCADE,
  INDEX idx_ul_id (ul_id),
  INDEX idx_active (active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table: tronc_queteur (Collection Box)
CREATE TABLE IF NOT EXISTS tronc_queteur (
  id INT AUTO_INCREMENT PRIMARY KEY,
  ul_id INT NOT NULL,
  queteur_id INT,
  point_quete_id INT,
  collection_date DATE NOT NULL,
  amount_collected DECIMAL(10, 2) DEFAULT 0.00,
  counted_by VARCHAR(100),
  counted_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (ul_id) REFERENCES ul(id) ON DELETE CASCADE,
  FOREIGN KEY (queteur_id) REFERENCES queteur(id) ON DELETE SET NULL,
  FOREIGN KEY (point_quete_id) REFERENCES point_quete(id) ON DELETE SET NULL,
  INDEX idx_ul_id (ul_id),
  INDEX idx_collection_date (collection_date),
  INDEX idx_queteur_id (queteur_id),
  INDEX idx_point_quete_id (point_quete_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table: yearly_goal (Annual Goals)
CREATE TABLE IF NOT EXISTS yearly_goal (
  id INT AUTO_INCREMENT PRIMARY KEY,
  ul_id INT NOT NULL,
  year INT NOT NULL,
  goal_amount DECIMAL(12, 2) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (ul_id) REFERENCES ul(id) ON DELETE CASCADE,
  UNIQUE KEY unique_ul_year (ul_id, year),
  INDEX idx_year (year)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table: daily_stats_before_rcq (Historical Data before RCQ system)
CREATE TABLE IF NOT EXISTS daily_stats_before_rcq (
  id INT AUTO_INCREMENT PRIMARY KEY,
  ul_id INT NOT NULL,
  collection_date DATE NOT NULL,
  amount_collected DECIMAL(10, 2) DEFAULT 0.00,
  collector_count INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (ul_id) REFERENCES ul(id) ON DELETE CASCADE,
  UNIQUE KEY unique_ul_date (ul_id, collection_date),
  INDEX idx_collection_date (collection_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Insert sample data for testing
INSERT INTO ul (name, code) VALUES
  ('Paris 15ème', 'PAR15'),
  ('Lyon 3ème', 'LYO03'),
  ('Marseille 8ème', 'MAR08');

INSERT INTO queteur (ul_id, first_name, last_name, email, active) VALUES
  (1, 'Jean', 'Dupont', 'jean.dupont@example.com', TRUE),
  (1, 'Marie', 'Martin', 'marie.martin@example.com', TRUE),
  (2, 'Pierre', 'Durand', 'pierre.durand@example.com', TRUE);

INSERT INTO yearly_goal (ul_id, year, goal_amount) VALUES
  (1, 2026, 50000.00),
  (2, 2026, 35000.00),
  (3, 2026, 42000.00);

