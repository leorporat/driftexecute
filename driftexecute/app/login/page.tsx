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
        <p className="text-sm text-slate-600">Loading session...</p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md items-center px-6 py-16">
      <section className="w-full rounded-none bg-panel p-8 shadow-panel">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Simulated Login</h1>
        <p className="mt-2 text-sm text-slate-600">Enter email only to start your local MVP session.</p>
        <form className="mt-6 space-y-4" onSubmit={handleSubmit(onSubmit)}>
          <label className="block text-sm font-semibold text-slate-700">
            Email
            <input
              className="mt-1 w-full rounded-none border border-slate-300 px-3 py-2 text-sm outline-none ring-sky-300 focus:ring-2"
              placeholder="you@example.com"
              type="email"
              {...register("email")}
            />
          </label>
          {errors.email ? <p className="text-sm text-rose-600">{errors.email.message}</p> : null}
          <button
            className="w-full rounded-none bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-60"
            disabled={isSubmitting}
            type="submit"
          >
            {isSubmitting ? "Signing in..." : "Continue"}
          </button>
        </form>
      </section>
    </main>
  );
}


