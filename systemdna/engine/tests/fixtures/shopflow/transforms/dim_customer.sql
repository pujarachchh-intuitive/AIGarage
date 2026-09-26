-- dim_customer: customer dimension with PII (email).
SELECT
    c.id   AS cust_id,
    c.email,
    o.amount
FROM customers c
JOIN orders o ON o.cust_id = c.id
