import type { Metadata } from "next";
import { RunClient } from "./run-client";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  return { title: `Change ${id}` };
}

export default async function ChangeRunPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <RunClient id={id} />;
}
