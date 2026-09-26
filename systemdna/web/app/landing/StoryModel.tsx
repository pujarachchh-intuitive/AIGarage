"use client";

// The landing page's model: the real scan of the demo repo, driven by the story chapter.
// Loaded lazily so the page's words paint before the 3D bundle arrives.

import { City3D } from "@/components/city/city-3d";
import type { CityData } from "@/lib/city";

export default function StoryModel({ data, chapter, title }: { data: CityData; chapter: number; title: string }) {
  return <City3D data={data} story={chapter} night={false} title={title} className="absolute inset-0" />;
}
