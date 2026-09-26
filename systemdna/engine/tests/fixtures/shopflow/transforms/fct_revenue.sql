-- fct_revenue: revenue fact table built from stg_orders.
-- Uses customer_key (not cust_id) — downstream of the alias chain.
SELECT
    customer_key,
    SUM(amount) AS total_revenue,
    COUNT(*)    AS order_count
FROM stg_orders
GROUP BY customer_key
