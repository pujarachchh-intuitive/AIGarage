// frontend/src/types.ts — TypeScript types for ShopFlow frontend

export interface Order {
  id: number;
  cust_id: number;
  amount: number;
}

export interface Customer {
  id: number;
  email: string;
}
