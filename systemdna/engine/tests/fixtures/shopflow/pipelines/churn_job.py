"""churn_job.py — PySpark churn prediction job.
Reads cust_id directly from the orders table.
"""
from pyspark.sql import SparkSession


def main():
    spark = SparkSession.builder.appName("churn_job").getOrCreate()

    # Read orders — uses cust_id
    orders = spark.read.table("orders")
    churn = orders.select("cust_id", "amount").groupBy("cust_id").count()
    churn.write.mode("overwrite").saveAsTable("churn_scores")


if __name__ == "__main__":
    main()
