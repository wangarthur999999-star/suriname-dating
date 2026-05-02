"use client";

import { createClient } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

type MatchRow = {
  user_a: string;
  user_b: string;
  matched_at: string;
};

type MatchedProfile = {
  id: string;
  nickname: string;
  bio: string | null;
  gender: "male" | "female" | "other";
  whatsapp: string | null;
};

function sanitizeWhatsapp(raw: string | null) {
  return (raw ?? "").replace(/\D/g, "");
}

function hasCountryCode(digitsOnly: string) {
  return digitsOnly.length >= 10;
}

export default function MatchesPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [matches, setMatches] = useState<MatchedProfile[]>([]);
  const [reportingUserId, setReportingUserId] = useState<string | null>(null);
  const [reportSubmittedById, setReportSubmittedById] = useState<Record<string, boolean>>({});

  const handleReportInvalidWhatsapp = async (reportedUserId: string) => {
    if (!currentUserId) {
      return;
    }

    setReportingUserId(reportedUserId);

    const { error } = await supabase.from("reports").insert({
      reporter: currentUserId,
      reported_user: reportedUserId,
      reason: "invalid_whatsapp",
    });

    if (error) {
      console.error(error);
      setErrorMessage(error.message);
      setReportingUserId(null);
      return;
    }

    setReportSubmittedById((prev) => ({
      ...prev,
      [reportedUserId]: true,
    }));
    setReportingUserId(null);
  };

  useEffect(() => {
    const loadMatches = async () => {
      setLoading(true);
      setErrorMessage(null);

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        if (userError) {
          console.error(userError);
        }
        router.replace("/");
        return;
      }

      setCurrentUserId(user.id);

      const { data: matchRows, error: matchesError } = await supabase
        .from("matches")
        .select("user_a, user_b, matched_at")
        .or(`user_a.eq.${user.id},user_b.eq.${user.id}`)
        .order("matched_at", { ascending: false });

      if (matchesError) {
        console.error(matchesError);
        setErrorMessage(matchesError.message);
        setLoading(false);
        return;
      }

      const otherUserIds = Array.from(
        new Set(
          ((matchRows ?? []) as MatchRow[]).map((row) =>
            row.user_a === user.id ? row.user_b : row.user_a
          )
        )
      );

      if (otherUserIds.length === 0) {
        setMatches([]);
        setLoading(false);
        return;
      }

      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("id, nickname, bio, gender, whatsapp")
        .in("id", otherUserIds);

      if (profilesError) {
        console.error(profilesError);
        setErrorMessage(profilesError.message);
        setLoading(false);
        return;
      }

      setMatches((profiles ?? []) as MatchedProfile[]);
      setLoading(false);
    };

    void loadMatches();
  }, [router, supabase]);

  return (
    <main className="min-h-screen bg-white px-4 py-6">
      <section className="mx-auto w-full max-w-md">
        <header className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">Matches</h1>
          <div className="flex items-center gap-2">
            <button
              onClick={() => router.push("/onboarding")}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700"
            >
              Edit my WhatsApp
            </button>
            <button
              onClick={() => router.push("/discover")}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700"
            >
              Back to Discover
            </button>
          </div>
        </header>

        {loading ? <p className="text-sm text-gray-500">Loading matches...</p> : null}

        {!loading && errorMessage ? (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{errorMessage}</p>
        ) : null}

        {!loading && !errorMessage && matches.length === 0 ? (
          <p className="text-sm text-gray-500">No matches yet.</p>
        ) : null}

        <div className="space-y-3">
          {matches.map((profile) => (
            <article key={profile.id} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
              <h2 className="text-lg font-semibold text-gray-900">{profile.nickname}</h2>
              <p className="text-sm text-gray-600">Gender: {profile.gender}</p>
              <p className="mt-1 text-sm text-gray-700">{profile.bio || "No bio yet."}</p>

              {(() => {
                const cleanWhatsapp = sanitizeWhatsapp(profile.whatsapp);
                const validWithCountryCode = hasCountryCode(cleanWhatsapp);

                if (!cleanWhatsapp) {
                  return <p className="mt-3 text-sm text-gray-500">No WhatsApp number available.</p>;
                }

                if (!validWithCountryCode) {
                  return (
                    <p className="mt-3 text-sm text-amber-700">
                      WhatsApp should include country code, e.g. 597xxxxxxx
                    </p>
                  );
                }

                return (
                  <a
                    href={`https://wa.me/${cleanWhatsapp}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-3 inline-flex w-full items-center justify-center rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-gray-700"
                  >
                    WhatsApp
                  </a>
                );
              })()}

              <button
                onClick={() => {
                  void handleReportInvalidWhatsapp(profile.id);
                }}
                disabled={!currentUserId || reportingUserId === profile.id || reportSubmittedById[profile.id]}
                className="mt-2 text-sm text-gray-600 underline underline-offset-2 disabled:opacity-50"
              >
                {reportingUserId === profile.id ? "Submitting..." : "Report invalid WhatsApp"}
              </button>

              {reportSubmittedById[profile.id] ? (
                <p className="mt-1 text-sm text-green-700">Report submitted</p>
              ) : null}
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
