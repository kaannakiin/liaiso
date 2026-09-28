-- Sample schema for the liaiso mssql-mcp documentation.
-- Creates the schema liaiso_shop in the current database, dropping it first if it exists.
-- Run it with a login that may create a schema, for example: sqlcmd -d YourDatabase -i liaiso-shop.sql

IF OBJECT_ID(N'liaiso_shop.order_totals', N'V') IS NOT NULL DROP VIEW liaiso_shop.order_totals;
IF OBJECT_ID(N'liaiso_shop.order_lines', N'U') IS NOT NULL DROP TABLE liaiso_shop.order_lines;
IF OBJECT_ID(N'liaiso_shop.orders', N'U') IS NOT NULL DROP TABLE liaiso_shop.orders;
IF OBJECT_ID(N'liaiso_shop.products', N'U') IS NOT NULL DROP TABLE liaiso_shop.products;
IF OBJECT_ID(N'liaiso_shop.customers', N'U') IS NOT NULL DROP TABLE liaiso_shop.customers;
IF OBJECT_ID(N'liaiso_shop.ledger', N'U') IS NOT NULL DROP TABLE liaiso_shop.ledger;
IF SCHEMA_ID(N'liaiso_shop') IS NOT NULL DROP SCHEMA liaiso_shop;
GO

CREATE SCHEMA liaiso_shop;
GO

CREATE TABLE liaiso_shop.customers (
  customer_id int NOT NULL CONSTRAINT pk_customers PRIMARY KEY,
  name nvarchar(100) NOT NULL,
  email nvarchar(200) NOT NULL CONSTRAINT uq_customers_email UNIQUE,
  city nvarchar(60) NULL,
  created_at datetime2(0) NOT NULL
);

CREATE TABLE liaiso_shop.products (
  product_id int NOT NULL CONSTRAINT pk_products PRIMARY KEY,
  sku varchar(20) NOT NULL CONSTRAINT uq_products_sku UNIQUE,
  name nvarchar(100) NOT NULL,
  unit_price decimal(10, 2) NOT NULL
);

CREATE TABLE liaiso_shop.orders (
  order_id int NOT NULL CONSTRAINT pk_orders PRIMARY KEY,
  customer_id int NOT NULL CONSTRAINT fk_orders_customer REFERENCES liaiso_shop.customers (customer_id),
  ordered_on date NOT NULL,
  status varchar(12) NOT NULL,
  shipped_at datetime2(0) NULL
);

CREATE TABLE liaiso_shop.order_lines (
  order_id int NOT NULL CONSTRAINT fk_lines_order REFERENCES liaiso_shop.orders (order_id),
  line_no smallint NOT NULL,
  product_id int NOT NULL CONSTRAINT fk_lines_product REFERENCES liaiso_shop.products (product_id),
  quantity int NOT NULL,
  unit_price decimal(10, 2) NOT NULL,
  CONSTRAINT pk_order_lines PRIMARY KEY (order_id, line_no)
);

CREATE TABLE liaiso_shop.ledger (
  entry_id bigint NOT NULL CONSTRAINT pk_ledger PRIMARY KEY,
  booked_at datetimeoffset(0) NOT NULL,
  amount decimal(38, 4) NOT NULL,
  note nvarchar(200) NULL
);
GO

CREATE VIEW liaiso_shop.order_totals AS
SELECT o.order_id, o.customer_id, o.status, SUM(l.quantity * l.unit_price) AS total
FROM liaiso_shop.orders AS o
JOIN liaiso_shop.order_lines AS l ON l.order_id = o.order_id
GROUP BY o.order_id, o.customer_id, o.status;
GO

EXEC sp_addextendedproperty N'MS_Description', N'People and companies that place orders.', N'SCHEMA', N'liaiso_shop', N'TABLE', N'customers';
EXEC sp_addextendedproperty N'MS_Description', N'City the customer is invoiced in.', N'SCHEMA', N'liaiso_shop', N'TABLE', N'customers', N'COLUMN', N'city';
EXEC sp_addextendedproperty N'MS_Description', N'Items for sale, with their current list price.', N'SCHEMA', N'liaiso_shop', N'TABLE', N'products';
EXEC sp_addextendedproperty N'MS_Description', N'One row per purchase; status is pending, shipped or cancelled.', N'SCHEMA', N'liaiso_shop', N'TABLE', N'orders';
EXEC sp_addextendedproperty N'MS_Description', N'When the parcel left the warehouse; empty until shipped.', N'SCHEMA', N'liaiso_shop', N'TABLE', N'orders', N'COLUMN', N'shipped_at';
EXEC sp_addextendedproperty N'MS_Description', N'The products and quantities of each order, at the price charged.', N'SCHEMA', N'liaiso_shop', N'TABLE', N'order_lines';
EXEC sp_addextendedproperty N'MS_Description', N'Revenue per order, summed from its lines.', N'SCHEMA', N'liaiso_shop', N'VIEW', N'order_totals';
EXEC sp_addextendedproperty N'MS_Description', N'Accounting entries with exact amounts.', N'SCHEMA', N'liaiso_shop', N'TABLE', N'ledger';
GO

INSERT INTO liaiso_shop.customers (customer_id, name, email, city, created_at) VALUES
  (1, N'Ada Yılmaz', N'ada@example.com', N'İstanbul', '2025-03-02T09:15:00'),
  (2, N'Emre Kaya', N'emre@example.com', N'Ankara', '2025-04-18T14:02:00'),
  (3, N'Lena Müller', N'lena@example.com', N'München', '2025-05-07T11:40:00'),
  (4, N'Omar Haddad', N'omar@example.com', N'İzmir', '2025-06-21T16:25:00'),
  (5, N'Zoë Martin', N'zoe@example.com', NULL, '2025-09-30T08:05:00');

INSERT INTO liaiso_shop.products (product_id, sku, name, unit_price) VALUES
  (10, 'DESK-OAK', N'Oak desk', 250.00),
  (11, 'CHAIR-ERG', N'Ergonomic chair', 85.00),
  (12, 'LAMP-LED', N'LED desk lamp', 30.00),
  (13, 'SHELF-WAL', N'Wall shelf', 45.50);

INSERT INTO liaiso_shop.orders (order_id, customer_id, ordered_on, status, shipped_at) VALUES
  (1001, 1, '2026-01-05', 'shipped', '2026-01-07T10:00:00'),
  (1002, 2, '2026-01-06', 'shipped', '2026-01-08T15:30:00'),
  (1003, 3, '2026-01-08', 'pending', NULL),
  (1004, 1, '2026-01-09', 'shipped', '2026-01-12T09:45:00'),
  (1005, 4, '2026-01-12', 'cancelled', NULL),
  (1006, 2, '2026-01-13', 'shipped', '2026-01-14T13:20:00'),
  (1007, 5, '2026-01-15', 'pending', NULL);

INSERT INTO liaiso_shop.order_lines (order_id, line_no, product_id, quantity, unit_price) VALUES
  (1001, 1, 10, 2, 250.00),
  (1001, 2, 12, 2, 30.00),
  (1002, 1, 11, 4, 85.00),
  (1003, 1, 13, 6, 45.50),
  (1004, 1, 11, 1, 85.00),
  (1004, 2, 12, 3, 30.00),
  (1005, 1, 10, 1, 250.00),
  (1006, 1, 12, 10, 28.00),
  (1007, 1, 11, 2, 85.00),
  (1007, 2, 13, 1, 45.50);

INSERT INTO liaiso_shop.ledger (entry_id, booked_at, amount, note) VALUES
  (9007199254740993, '2026-01-31T23:30:00+03:00', 123456789012345678.1234, N'Year-end revaluation'),
  (9007199254740994, '2026-02-01T00:10:00+03:00', 12.5000, N'Bank fee');
GO
