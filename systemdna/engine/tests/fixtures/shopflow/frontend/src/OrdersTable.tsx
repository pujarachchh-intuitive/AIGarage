// frontend/src/OrdersTable.tsx — React component displaying orders

import React from "react";
import type { Order } from "./types";

interface Props {
  orders: Order[];
}

export function OrdersTable({ orders }: Props) {
  return (
    <table>
      <thead>
        <tr>
          <th>ID</th>
          <th>Customer</th>
          <th>Amount</th>
        </tr>
      </thead>
      <tbody>
        {orders.map((o) => (
          <tr key={o.id}>
            <td>{o.id}</td>
            <td>{o.cust_id}</td>
            <td>{o.amount}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
