"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { getPreferences } from "@/lib/api/client";
import { useSessionStore } from "@/store/session";

const loginSchema = z.object({
  email: z.string().email("Enter a valid email address."),
});

type LoginValues = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const router = useRouter();
  const email = useSessionStore((state) => state.email);
  const hasHydrated = useSessionStore((state) => state.hasHydrated);
  const setEmail = useSessionStore((state) => state.setEmail);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
    },
  });

  useEffect(() => {
    if (hasHydrated && email && !isSubmitting) {
      router.replace("/trips");
    }
  }, [email, hasHydrated, isSubmitting, router]);

  const onSubmit = async (values: LoginValues) => {
    const normalized = values.email.trim().toLowerCase();
    setEmail(normalized);
    const preferences = await getPreferences();
    router.push(preferences ? "/trips" : "/onboarding/preferences");
  };

  if (!hasHydrated) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-md items-center px-6">
        <p className="read-box text-sm">Loading session...</p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md items-center px-6 py-16">
      <section className="w-full rounded-none border border-zinc-500 bg-panelSoft p-8 shadow-panel">
        <h1 className="text-2xl font-bold tracking-tight text-zinc-100">Simulated Login</h1>
        <p className="read-box mt-3 text-sm">Enter email only to start your local MVP session.</p>
        <form className="mt-6 space-y-4" onSubmit={handleSubmit(onSubmit)}>
          <label className="block text-sm font-semibold text-zinc-300">
            Email
            <input
              className="mt-1 w-full rounded-none border border-zinc-500 px-3 py-2 text-sm outline-none ring-orange-500 focus:ring-2"
              placeholder="you@example.com"
              type="email"
              {...register("email")}
            />
          </label>
          {errors.email ? <p className="text-sm text-rose-600">{errors.email.message}</p> : null}
          <button
            className="w-full rounded-none bg-accent px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-accentDeep disabled:opacity-60"
            disabled={isSubmitting}
            type="submit"
          >
            {isSubmitting ? "Signing in..." : "Continue"}
          </button>
          <p className="white-chip inline-block">Orange + white highlight theme active</p>
        </form>
      </section>
    </main>
  );
}





