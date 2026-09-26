-- stg_orders: stage the orders table.
-- ALIAS TRAP: cust_id is renamed to customer_key here.
-- Downstream of this model is safe when cust_id is renamed.
SELECT
    id,
    cust_id AS customer_key,
    amount,
    created_at
FROM orders
