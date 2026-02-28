"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";
import { getPreferences, savePreferences } from "@/lib/api/client";
import { constraintOptions, interestOptions, paceOptions } from "@/lib/types";
import type { Constraint, Interest } from "@/lib/types";

const preferenceSchema = z
  .object({
    budgetMin: z.coerce.number().min(0, "Minimum budget must be >= 0"),
    budgetMax: z.coerce.number().min(0, "Maximum budget must be >= 0"),
    tripLengthPreferredDays: z.coerce.number().min(1, "Must be at least 1 day").max(30),
    pace: z.enum(paceOptions),
    interests: z.array(z.enum(interestOptions)).min(1, "Pick at least one interest"),
    constraints: z.array(z.enum(constraintOptions)),
  })
  .refine((value) => value.budgetMax >= value.budgetMin, {
    path: ["budgetMax"],
    message: "Maximum budget must be greater than or equal to minimum budget.",
  });

type PreferenceValues = z.infer<typeof preferenceSchema>;

interface ChipGroupProps {
  options: readonly string[];
  value: string[];
  onChange: (next: string[]) => void;
}

function ChipGroup({ options, value, onChange }: ChipGroupProps) {
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {options.map((option) => {
        const selected = value.includes(option);
        return (
          <button
            className={`rounded-none border px-3 py-1.5 text-xs font-semibold transition ${
              selected
                ? "border-sky-300 bg-sky-100 text-sky-800"
                : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
            }`}
            key={option}
            onClick={(event) => {
              event.preventDefault();
              onChange(
                selected ? value.filter((item) => item !== option) : [...value, option],
              );
            }}
            type="button"
          >
            {option}
          </button>
        );
      })}
    </div>
  );
}

export default function PreferencesPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);

  const {
    register,
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
  } = useForm<PreferenceValues>({
    resolver: zodResolver(preferenceSchema),
    defaultValues: {
      budgetMin: 1000,
      budgetMax: 2500,
      tripLengthPreferredDays: 5,
      pace: "moderate",
      interests: ["food", "museums"],
      constraints: [],
    },
  });

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      const existing = await getPreferences();
      if (mounted && existing) {
        reset({
          budgetMin: existing.budgetMin,
          budgetMax: existing.budgetMax,
          tripLengthPreferredDays: existing.tripLengthPreferredDays,
          pace: existing.pace,
          interests: existing.interests,
          constraints: existing.constraints,
        });
      }
      if (mounted) {
        setLoading(false);
      }
    };
    void load();
    return () => {
      mounted = false;
    };
  }, [reset]);

  const onSubmit = async (values: PreferenceValues) => {
    await savePreferences(values);
    router.push("/trips");
  };

  if (loading) {
    return <p className="text-sm text-slate-600">Loading preferences...</p>;
  }

  return (
    <section className="mx-auto max-w-3xl rounded-none bg-panel p-6 shadow-panel sm:p-8">
      <h1 className="text-2xl font-bold text-slate-900">Travel Preferences</h1>
      <p className="mt-2 text-sm text-slate-600">
        These preferences drive recommendations and chat context.
      </p>
      <form className="mt-6 space-y-5" onSubmit={handleSubmit(onSubmit)}>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-semibold text-slate-700">
            Budget min (USD)
            <input
              className="mt-1 w-full rounded-none border border-slate-300 px-3 py-2 text-sm"
              type="number"
              {...register("budgetMin")}
            />
          </label>
          <label className="text-sm font-semibold text-slate-700">
            Budget max (USD)
            <input
              className="mt-1 w-full rounded-none border border-slate-300 px-3 py-2 text-sm"
              type="number"
              {...register("budgetMax")}
            />
          </label>
        </div>
        {errors.budgetMax ? (
          <p className="text-sm text-rose-600">{errors.budgetMax.message}</p>
        ) : null}

        <label className="block text-sm font-semibold text-slate-700">
          Preferred trip length (days)
          <input
            className="mt-1 w-full rounded-none border border-slate-300 px-3 py-2 text-sm"
            type="number"
            {...register("tripLengthPreferredDays")}
          />
        </label>

        <label className="block text-sm font-semibold text-slate-700">
          Pace
          <select
            className="mt-1 w-full rounded-none border border-slate-300 px-3 py-2 text-sm"
            {...register("pace")}
          >
            {paceOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>

        <div>
          <p className="text-sm font-semibold text-slate-700">Interests</p>
          <Controller
            control={control}
            name="interests"
            render={({ field }) => (
              <ChipGroup
                onChange={(next) => field.onChange(next as Interest[])}
                options={interestOptions}
                value={field.value ?? []}
              />
            )}
          />
          {errors.interests ? (
            <p className="mt-1 text-sm text-rose-600">{errors.interests.message}</p>
          ) : null}
        </div>

        <div>
          <p className="text-sm font-semibold text-slate-700">Constraints</p>
          <Controller
            control={control}
            name="constraints"
            render={({ field }) => (
              <ChipGroup
                onChange={(next) => field.onChange(next as Constraint[])}
                options={constraintOptions}
                value={field.value ?? []}
              />
            )}
          />
        </div>

        <button
          className="rounded-none bg-sky-600 px-5 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-60"
          disabled={isSubmitting}
          type="submit"
        >
          {isSubmitting ? "Saving..." : "Save preferences"}
        </button>
      </form>
    </section>
  );
}


