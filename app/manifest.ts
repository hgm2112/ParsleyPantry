import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Parsley Pantry",
    short_name: "Parsley Pantry",
    description:
      "Barcode-first pantry inventory, grocery lists, recipes and meal planning for your household.",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#009444",
    icons: [
      {
        src: "/icon-192x192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icon-512x512.png",
        sizes: "512x512",
        type: "image/png",
      },
      {
        src: "/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
