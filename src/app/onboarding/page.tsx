"use client";

import { createClient } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";

type GenderOption = "male" | "female" | "other";
type InterestedInOption = "male" | "female" | "everyone";

export default function OnboardingPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [checkingAuth, setCheckingAuth] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);

  const [nickname, setNickname] = useState("");
  const [gender, setGender] = useState<GenderOption>("male");
  const [interestedIn, setInterestedIn] = useState<InterestedInOption>("female");
  const [bio, setBio] = useState("");
  const [whatsapp, setWhatsapp] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const checkUser = async () => {
      const {
        data: { user },
        error,
      } = await supabase.auth.getUser();

      if (error || !user) {
        if (error) {
          console.error(error);
        }
        router.replace("/");
        setCheckingAuth(false);
        return;
      }

      setUserId(user.id);

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("nickname, gender, interested_in, bio, whatsapp")
        .eq("id", user.id)
        .maybeSingle();

      if (profileError) {
        console.error(profileError);
        setCheckingAuth(false);
        return;
      }

      if (profile) {
        setNickname(profile.nickname ?? "");
        setGender((profile.gender as GenderOption) ?? "male");
        setInterestedIn((profile.interested_in as InterestedInOption) ?? "female");
        setBio(profile.bio ?? "");
        setWhatsapp(profile.whatsapp ?? "");
      }

      setCheckingAuth(false);
    };

    void checkUser();
  }, [router, supabase]);

  const getCurrentPosition = () =>
    new Promise<GeolocationPosition>((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error("Geolocation is not supported by your browser."));
        return;
      }

      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      });
    });

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!userId) {
      router.replace("/");
      return;
    }

    const sanitizedWhatsapp = whatsapp.replace(/\D/g, "");
    const whatsappError = "WhatsApp should include country code, e.g. 597xxxxxxx";

    if (!sanitizedWhatsapp.startsWith("597") || sanitizedWhatsapp.length < 10) {
      setErrorMessage(whatsappError);
      return;
    }

    setSubmitting(true);
    setErrorMessage(null);

    try {
      const position = await getCurrentPosition();
      const lat = position.coords.latitude;
      const lng = position.coords.longitude;
      const locationPoint = `POINT(${lng} ${lat})`;

      const { error } = await supabase.from("profiles").upsert({
        id: userId,
        nickname: nickname.trim(),
        gender,
        interested_in: interestedIn,
        bio: bio.trim() || null,
        whatsapp: sanitizedWhatsapp,
        location: locationPoint,
      });

      if (error) {
        throw error;
      }

      router.push("/discover");
    } catch (error) {
      console.error(error);
      const message = error instanceof Error ? error.message : "Failed to save profile.";
      setErrorMessage(message);
      setSubmitting(false);
    }
  };

  if (checkingAuth) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-white px-6">
        <p className="text-sm text-gray-500">Loading...</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-white px-4 py-8">
      <section className="mx-auto w-full max-w-md">
        <h1 className="text-2xl font-bold text-gray-900">Complete your profile</h1>
        <p className="mt-2 text-sm text-gray-500">Tell us a bit about you to get started.</p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-gray-700">Nickname</span>
            <input
              required
              value={nickname}
              onChange={(event) => setNickname(event.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none ring-0 focus:border-gray-500"
              placeholder="Your nickname"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-sm font-medium text-gray-700">Gender</span>
            <select
              value={gender}
              onChange={(event) => setGender(event.target.value as GenderOption)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-gray-500"
            >
              <option value="male">Male</option>
              <option value="female">Female</option>
              <option value="other">Other</option>
            </select>
          </label>

          <label className="block">
            <span className="mb-1 block text-sm font-medium text-gray-700">Interested in</span>
            <select
              value={interestedIn}
              onChange={(event) => setInterestedIn(event.target.value as InterestedInOption)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-gray-500"
            >
              <option value="male">Men</option>
              <option value="female">Women</option>
              <option value="everyone">Everyone</option>
            </select>
          </label>

          <label className="block">
            <span className="mb-1 block text-sm font-medium text-gray-700">Bio</span>
            <textarea
              value={bio}
              onChange={(event) => setBio(event.target.value)}
              className="min-h-24 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-gray-500"
              placeholder="Short intro"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-sm font-medium text-gray-700">WhatsApp</span>
            <input
              required
              value={whatsapp}
              onChange={(event) => setWhatsapp(event.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-gray-500"
              placeholder="+597..."
            />
          </label>

          {errorMessage ? (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{errorMessage}</p>
          ) : null}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-lg bg-gray-900 px-4 py-3 text-sm font-medium text-white transition hover:bg-gray-700 disabled:opacity-60"
          >
            {submitting ? "Saving..." : "Save and continue"}
          </button>
        </form>
      </section>
    </main>
  );
}
