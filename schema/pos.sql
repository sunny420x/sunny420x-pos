-- Canonical MySQL schema. Startup synchronizes missing/changed columns and indexes.
CREATE TABLE IF NOT EXISTS companies (
 id int(11) UNSIGNED NOT NULL AUTO_INCREMENT,
 name varchar(100) NOT NULL,
 code varchar(100) NOT NULL,
 stock_mode enum('pos','inventory_only') NOT NULL DEFAULT 'pos',
 receipt_size enum('a5_landscape','80x80') NOT NULL DEFAULT 'a5_landscape',
 PRIMARY KEY (id),
 UNIQUE KEY uq_company_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `customers` (
  `id` int(11) UNSIGNED NOT NULL AUTO_INCREMENT,
  `first_name` varchar(100) NOT NULL,
  `last_name` varchar(100) NOT NULL,
  `card_id` varchar(13) DEFAULT NULL,
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
 KEY idx_customers_company (company_id, id),
 KEY idx_customers_company_name (company_id, first_name, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `discounts` (
  `id` int(11) UNSIGNED NOT NULL AUTO_INCREMENT,
  `code` varchar(100) NOT NULL,
  `amount` bigint(20) UNSIGNED NOT NULL,
  `discount_type` enum('percentage','fixed') NOT NULL DEFAULT 'percentage',
  `minimum_purchase` bigint(20) UNSIGNED NOT NULL DEFAULT 0,
  `max_uses` int(10) UNSIGNED DEFAULT 1,
  `usage_count` int(10) UNSIGNED NOT NULL DEFAULT 0,
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

CREATE TABLE IF NOT EXISTS `quotations` (
  `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT,
  `customer_id` int(11) UNSIGNED DEFAULT NULL,
  `discount_id` int(11) UNSIGNED DEFAULT NULL,
  `discount_code` varchar(100) DEFAULT NULL,
  `discount_type` enum('percentage','fixed') DEFAULT NULL,
  `discount_amount` bigint(20) UNSIGNED NOT NULL DEFAULT 0,
  `minimum_purchase` bigint(20) UNSIGNED NOT NULL DEFAULT 0,
  `subtotal` bigint(20) UNSIGNED NOT NULL,
  `total` decimal(15,2) UNSIGNED NOT NULL,
  `status` enum('pending','confirmed') NOT NULL DEFAULT 'pending',
  `billing_id` int(11) DEFAULT NULL,
  `created_by` int(11) UNSIGNED NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `confirmed_at` timestamp NULL DEFAULT NULL,
  `company_id` int(11) UNSIGNED NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  KEY idx_quotations_company (company_id, id),
  KEY idx_quotations_company_status (company_id, status, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `quotation_items` (
  `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT,
  `quotation_id` bigint(20) UNSIGNED NOT NULL,
  `product_type` int(11) UNSIGNED NOT NULL,
  `product_name` varchar(200) NOT NULL,
  `product_price` bigint(20) UNSIGNED NOT NULL,
  `amount` int(10) UNSIGNED NOT NULL,
  `line_total` bigint(20) UNSIGNED NOT NULL,
  `company_id` int(11) UNSIGNED NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  KEY idx_quotation_items_company_quote (company_id, quotation_id, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `quotation_asset_items` (
  `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT,
  `quotation_id` bigint(20) UNSIGNED NOT NULL,
  `asset_type` int(11) UNSIGNED NOT NULL,
  `asset_name` varchar(200) NOT NULL,
  `amount` int(10) UNSIGNED NOT NULL,
  `company_id` int(11) UNSIGNED NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  KEY idx_quotation_asset_company_quote (company_id, quotation_id, id)
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
 KEY idx_products_company (company_id, id),
 KEY idx_products_company_name_price (company_id, name, price),
 KEY idx_products_company_transaction (company_id, transaction_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `product_inventory_settings` (
  `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT,
  `product_type` int(11) UNSIGNED NOT NULL,
  `product_name` varchar(200) NOT NULL,
  `tracking_mode` enum('quantity','availability') NOT NULL DEFAULT 'quantity',
  `is_available` tinyint(1) NOT NULL DEFAULT 1,
  `company_id` int(11) UNSIGNED NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  UNIQUE KEY uq_product_inventory_company_product (company_id, product_type, product_name),
  KEY idx_product_inventory_company_mode (company_id, tracking_mode, is_available)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `asset_transactions` (
  `id` int(11) UNSIGNED NOT NULL AUTO_INCREMENT,
  `billing_id` int(11) DEFAULT NULL,
  `type` int(11) UNSIGNED NOT NULL,
  `name` varchar(200) NOT NULL,
  `value` int(11) NOT NULL,
  `asset_id` int(11) UNSIGNED DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `company_id` int(11) UNSIGNED NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  KEY idx_asset_transactions_company_type_name (company_id, type, name),
  KEY idx_asset_transactions_company_billing (company_id, billing_id, asset_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `asset_types` (
  `id` int(11) UNSIGNED NOT NULL AUTO_INCREMENT,
  `name` varchar(100) NOT NULL,
  `company_id` int(11) UNSIGNED NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  UNIQUE KEY uq_asset_types_company_name (`company_id`, `name`),
  KEY idx_asset_types_company (company_id, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `assets` (
  `id` int(11) UNSIGNED NOT NULL AUTO_INCREMENT,
  `name` varchar(200) NOT NULL,
  `type` int(11) UNSIGNED NOT NULL,
  `import_price` int(12) UNSIGNED DEFAULT NULL,
  `is_used` tinyint(1) NOT NULL DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT NULL,
  `asset_transaction_id` int(11) UNSIGNED DEFAULT NULL,
  `company_id` int(11) UNSIGNED NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  KEY idx_assets_company_type_name_used (company_id, type, name, is_used),
  KEY idx_assets_company_transaction (company_id, asset_transaction_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `product_asset_recipes` (
  `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT,
  `product_type` int(11) UNSIGNED NOT NULL,
  `product_name` varchar(200) NOT NULL,
  `asset_type` int(11) UNSIGNED NOT NULL,
  `asset_name` varchar(200) NOT NULL,
  `amount_per_product` int(10) UNSIGNED NOT NULL,
  `company_id` int(11) UNSIGNED NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  UNIQUE KEY uq_product_asset_recipe (company_id, product_type, product_name, asset_type, asset_name),
  KEY idx_product_asset_recipe_company_product (company_id, product_type, product_name)
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
 KEY idx_transaction_company (company_id, id),
 KEY idx_transaction_company_type_name (company_id, type, name),
 KEY idx_transaction_company_customer_billing (company_id, customer_id, billing_id),
 KEY idx_transaction_company_billing_stock (company_id, billing_id, stock_id)
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
