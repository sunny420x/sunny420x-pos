-- Canonical MySQL schema. Startup synchronizes missing/changed columns and indexes.
CREATE TABLE IF NOT EXISTS companies (
 id int(11) UNSIGNED NOT NULL AUTO_INCREMENT,
 name varchar(100) NOT NULL,
 code varchar(100) NOT NULL,
 PRIMARY KEY (id),
 UNIQUE KEY uq_company_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `customers` (
  `id` int(11) UNSIGNED NOT NULL AUTO_INCREMENT,
  `first_name` varchar(100) NOT NULL,
  `last_name` varchar(100) NOT NULL,
  `card_id` varchar(13) NOT NULL,
  `phone_number` varchar(11) NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT NULL,
  `moo` varchar(50) DEFAULT NULL,
  `home_id` varchar(50) DEFAULT NULL,
  `village` varchar(50) DEFAULT NULL,
  `soi` varchar(50) DEFAULT NULL,
  `street` varchar(50) DEFAULT NULL,
  `sub_district` varchar(50) DEFAULT NULL,
  `district` varchar(50) DEFAULT NULL,
  `state` varchar(50) DEFAULT NULL,
  `zip` varchar(50) DEFAULT NULL,
 company_id int(11) UNSIGNED NOT NULL DEFAULT 1,
 PRIMARY KEY (id),
 KEY idx_customers_company (company_id, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `discounts` (
  `id` int(11) UNSIGNED NOT NULL AUTO_INCREMENT,
  `code` varchar(100) NOT NULL,
  `amount` int(3) NOT NULL,
  `status` int(1) NOT NULL DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `created_by` int(11) NOT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  `updated_by` int(11) DEFAULT NULL,
  `billing_id` int(11) DEFAULT NULL,
 company_id int(11) UNSIGNED NOT NULL DEFAULT 1,
 PRIMARY KEY (id),
 KEY idx_discounts_company (company_id, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `login_history` (
  `id` int(11) UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` int(11) NOT NULL,
  `time` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `ip_address` varchar(50) NOT NULL,
 company_id int(11) UNSIGNED NOT NULL DEFAULT 1,
 PRIMARY KEY (id),
 KEY idx_login_history_company (company_id, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `products` (
  `id` int(11) UNSIGNED NOT NULL AUTO_INCREMENT,
  `name` varchar(200) NOT NULL,
  `type` int(11) NOT NULL,
  `price` int(12) NOT NULL,
  `is_sold` int(1) NOT NULL DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT NULL,
  `transaction_id` int(11) DEFAULT NULL,
  `import_price` int(12) DEFAULT NULL,
 company_id int(11) UNSIGNED NOT NULL DEFAULT 1,
 PRIMARY KEY (id),
 KEY idx_products_company (company_id, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `product_types` (
  `id` int(11) UNSIGNED NOT NULL AUTO_INCREMENT,
  `name` varchar(100) NOT NULL,
 company_id int(11) UNSIGNED NOT NULL DEFAULT 1,
 PRIMARY KEY (id),
 KEY idx_product_types_company (company_id, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `transaction` (
  `id` int(11) UNSIGNED NOT NULL AUTO_INCREMENT,
  `billing_id` int(11) DEFAULT NULL,
  `type` int(11) NOT NULL,
  `name` varchar(200) NOT NULL,
  `value` int(11) NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `customer_id` int(11) DEFAULT NULL,
  `expired_date` date DEFAULT NULL,
  `stock_id` int(11) DEFAULT NULL,
 company_id int(11) UNSIGNED NOT NULL DEFAULT 1,
 PRIMARY KEY (id),
 KEY idx_transaction_company (company_id, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `users` (
  `id` int(11) UNSIGNED NOT NULL AUTO_INCREMENT,
  `username` varchar(100) NOT NULL,
  `password` varchar(255) NOT NULL,
  `type` int(1) NOT NULL DEFAULT 0,
  `full_name` varchar(100) NOT NULL,
  `created_by` int(11) NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_by` int(11) DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  `color` varchar(12) DEFAULT '#B7B1F2',
 company_id int(11) UNSIGNED NOT NULL DEFAULT 1,
 PRIMARY KEY (id),
 KEY idx_users_company (company_id, id),
 UNIQUE KEY uq_company_username (company_id, username)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `user_types` (
  `id` int(11) UNSIGNED NOT NULL AUTO_INCREMENT,
  `name` varchar(100) NOT NULL,
  `permission` varchar(500) DEFAULT NULL,
 company_id int(11) UNSIGNED NOT NULL DEFAULT 1,
 PRIMARY KEY (id),
 KEY idx_user_types_company (company_id, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS auth_sessions (
 token_hash char(64) NOT NULL,
 user_id int(11) UNSIGNED NOT NULL,
 company_id int(11) UNSIGNED NOT NULL,
 expires_at datetime NOT NULL,
 PRIMARY KEY (token_hash),
 KEY idx_session_company (company_id, user_id),
 KEY idx_session_expiry (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
