-- ShopFlow sample schema
CREATE TABLE orders (
    id          SERIAL PRIMARY KEY,
    cust_id     INTEGER NOT NULL,
    amount      DECIMAL(10,2) NOT NULL,
    created_at  TIMESTAMP DEFAULT NOW()
);

CREATE TABLE customers (
    id     SERIAL PRIMARY KEY,
    email  VARCHAR(255) UNIQUE NOT NULL,
    name   VARCHAR(255)
);
