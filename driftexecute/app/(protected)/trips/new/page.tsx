"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChangeEvent, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { createTrip } from "@/lib/api/client";

const tripSchema = z.object({
  title: z.string().min(2, "Title is required"),
  destinationsInput: z.string().min(2, "Add at least one destination"),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  totalCost: z.coerce.number().min(0, "Cost must be >= 0"),
  rating: z.coerce.number().min(1, "Rating must be 1-10").max(10, "Rating must be 1-10"),
  tagsInput: z.string().optional(),
  highlights: z.string().default(""),
  painPoints: z.string().default(""),
  notes: z.string().default(""),
});

type TripValues = z.infer<typeof tripSchema>;

function parseCsv(value: string | undefined): string[] {
  if (!value) {
    return [];
  }
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export default function NewTripPage() {
  const router = useRouter();
  const [photoDataUrl, setPhotoDataUrl] = useState<string | undefined>(undefined);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<TripValues>({
    resolver: zodResolver(tripSchema),
    defaultValues: {
      title: "",
      destinationsInput: "",
      startDate: "",
      endDate: "",
      totalCost: 1200,
      rating: 8,
      tagsInput: "",
      highlights: "",
      painPoints: "",
      notes: "",
    },
  });

  const handlePhotoChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      setPhotoDataUrl(undefined);
      setPhotoError(null);
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      setPhotoError("Photo must be 2MB or smaller.");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setPhotoError(null);
      setPhotoDataUrl(typeof reader.result === "string" ? reader.result : undefined);
    };
    reader.readAsDataURL(file);
  };

  const onSubmit = async (values: TripValues) => {
    await createTrip({
      title: values.title,
      destinations: parseCsv(values.destinationsInput),
      photoDataUrl,
      startDate: values.startDate || undefined,
      endDate: values.endDate || undefined,
      totalCost: values.totalCost,
      rating: values.rating,
      tags: parseCsv(values.tagsInput),
      highlights: values.highlights,
      painPoints: values.painPoints,
      notes: values.notes,
    });
    router.push("/trips");
  };

  return (
    <section className="mx-auto max-w-3xl rounded-none bg-panel p-6 shadow-panel sm:p-8">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-zinc-100">Add Past Trip</h1>
        <Link className="text-sm font-semibold text-orange-400 hover:text-orange-300" href="/trips">
          Back to trips
        </Link>
      </div>

      <form className="space-y-4" onSubmit={handleSubmit(onSubmit)}>
        <label className="block text-sm font-semibold text-zinc-300">
          Title
          <input
            className="mt-1 w-full rounded-none border border-zinc-500 px-3 py-2 text-sm"
            {...register("title")}
          />
          {errors.title ? <p className="mt-1 text-sm text-rose-600">{errors.title.message}</p> : null}
        </label>

        <label className="block text-sm font-semibold text-zinc-300">
          Destinations (comma-separated)
          <input
            className="mt-1 w-full rounded-none border border-zinc-500 px-3 py-2 text-sm"
            placeholder="Barcelona, Madrid"
            {...register("destinationsInput")}
          />
          {errors.destinationsInput ? (
            <p className="mt-1 text-sm text-rose-600">{errors.destinationsInput.message}</p>
          ) : null}
        </label>

        <div>
          <label className="block text-sm font-semibold text-zinc-300">
            Trip photo
            <input
              accept="image/*"
              className="mt-1 block w-full text-sm text-zinc-300 file:mr-3 file:rounded-none file:border file:border-zinc-500 file:bg-zinc-700 file:px-3 file:py-1.5 file:text-sm file:font-semibold"
              onChange={handlePhotoChange}
              type="file"
            />
          </label>
          {photoError ? <p className="mt-1 text-sm text-rose-600">{photoError}</p> : null}
          {photoDataUrl ? (
            <div className="mt-2">
              <img
                alt="Trip preview"
                className="h-40 w-full rounded-none border border-zinc-800 object-cover"
                src={photoDataUrl}
              />
              <button
                className="mt-2 rounded-none border border-zinc-500 px-3 py-1.5 text-xs font-semibold text-zinc-300 hover:bg-zinc-700"
                onClick={() => setPhotoDataUrl(undefined)}
                type="button"
              >
                Remove photo
              </button>
            </div>
          ) : null}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-semibold text-zinc-300">
            Start date (optional)
            <input
              className="mt-1 w-full rounded-none border border-zinc-500 px-3 py-2 text-sm"
              type="date"
              {...register("startDate")}
            />
          </label>
          <label className="text-sm font-semibold text-zinc-300">
            End date (optional)
            <input
              className="mt-1 w-full rounded-none border border-zinc-500 px-3 py-2 text-sm"
              type="date"
              {...register("endDate")}
            />
          </label>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-semibold text-zinc-300">
            Total cost (USD)
            <input
              className="mt-1 w-full rounded-none border border-zinc-500 px-3 py-2 text-sm"
              type="number"
              {...register("totalCost")}
            />
          </label>
          <label className="text-sm font-semibold text-zinc-300">
            Rating (1-10)
            <input
              className="mt-1 w-full rounded-none border border-zinc-500 px-3 py-2 text-sm"
              type="number"
              {...register("rating")}
            />
          </label>
        </div>

        <label className="block text-sm font-semibold text-zinc-300">
          Tags (comma-separated)
          <input
            className="mt-1 w-full rounded-none border border-zinc-500 px-3 py-2 text-sm"
            placeholder="food, museums, family"
            {...register("tagsInput")}
          />
        </label>

        <label className="block text-sm font-semibold text-zinc-300">
          Highlights
          <textarea
            className="mt-1 min-h-20 w-full rounded-none border border-zinc-500 px-3 py-2 text-sm"
            {...register("highlights")}
          />
        </label>

        <label className="block text-sm font-semibold text-zinc-300">
          Pain points
          <textarea
            className="mt-1 min-h-20 w-full rounded-none border border-zinc-500 px-3 py-2 text-sm"
            {...register("painPoints")}
          />
        </label>

        <label className="block text-sm font-semibold text-zinc-300">
          Notes
          <textarea
            className="mt-1 min-h-20 w-full rounded-none border border-zinc-500 px-3 py-2 text-sm"
            {...register("notes")}
          />
        </label>

        <button
          className="rounded-none border border-accent bg-accent px-5 py-2 text-sm font-semibold text-zinc-950 hover:bg-accentDeep disabled:opacity-60"
          disabled={isSubmitting}
          type="submit"
        >
          {isSubmitting ? "Saving..." : "Create trip"}
        </button>
      </form>
    </section>
  );
}





