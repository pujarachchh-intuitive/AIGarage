"""export_job.py — Finance export job.
DYNAMIC SQL TRAP: builds a query string with an f-string.
The column name 'cust_id' only appears inside a string — grep misses it.
This edge must be found by the Bob Cartographer agent (confidence=medium).
"""
from pyspark.sql import SparkSession


def main():
    spark = SparkSession.builder.appName("export_job").getOrCreate()

    # Dynamic SQL trap: col name built at runtime
    col = "cust_id"
    query = f"SELECT {col}, amount FROM orders"
    df = spark.sql(query)
    df.write.mode("overwrite").csv("/exports/finance_orders.csv")


if __name__ == "__main__":
    main()
