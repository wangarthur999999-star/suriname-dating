"use client";

import { createClient } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

type NearbyProfile = {
  id: string;
  nickname: string;
  gender: "male" | "female" | "other";
  bio: string | null;
  distance_meters: number;
};

export default function DiscoverPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [profiles, setProfiles] = useState<NearbyProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [likingUserId, setLikingUserId] = useState<string | null>(null);

  useEffect(() => {
    const loadProfiles = async () => {
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

      if (!navigator.geolocation) {
        setErrorMessage("Geolocation is not supported by your browser.");
        setLoading(false);
        return;
      }

      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const { latitude: lat, longitude: lng } = position.coords;

          const { data, error } = await supabase.rpc("get_nearby_profiles", {
            lat,
            lng,
            max_distance_meters: 50000,
            limit_count: 20,
          });

          if (error) {
            console.error(error);
            setErrorMessage(error.message);
            setLoading(false);
            return;
          }

          setProfiles((data ?? []) as NearbyProfile[]);
          setLoading(false);
        },
        (geoError) => {
          console.error(geoError);
          setErrorMessage(geoError.message || "Failed to get current location.");
          setLoading(false);
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      );
    };

    void loadProfiles();
  }, [router, supabase]);

  const handleLike = async (targetUserId: string) => {
    if (!currentUserId || likingUserId) {
      return;
    }

    setLikingUserId(targetUserId);

    try {
      const { error: likeError } = await supabase.from("likes").insert({
        from_user: currentUserId,
        to_user: targetUserId,
      });

      const isDuplicateLike =
        likeError?.code === "23505" || likeError?.message.toLowerCase().includes("duplicate key") === true;

      if (likeError && !isDuplicateLike) {
        console.error(likeError);
        alert(likeError.message);
        return;
      }

      if (likeError && isDuplicateLike) {
        console.error(likeError);
      }

      setProfiles((prev) => prev.filter((profile) => profile.id !== targetUserId));

      const { data: isMatch, error: matchError } = await supabase.rpc("has_mutual_like", {
        user_a: currentUserId,
        user_b: targetUserId,
      });

      if (matchError) {
        console.error(matchError);
        alert(matchError.message);
        return;
      }

      if (isMatch) {
        alert("It's a match! Check Matches to chat on WhatsApp.");
      }
    } finally {
      setLikingUserId(null);
    }
  };

  return (
    <main className="min-h-screen bg-white px-4 py-6">
      <section className="mx-auto w-full max-w-md">
        <header className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">Discover</h1>
          <button
            onClick={() => router.push("/matches")}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700"
          >
            Matches
          </button>
        </header>

        {loading ? <p className="text-sm text-gray-500">Loading nearby people...</p> : null}

        {!loading && errorMessage ? (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{errorMessage}</p>
        ) : null}

        {!loading && !errorMessage && profiles.length === 0 ? (
          <p className="text-sm text-gray-500">No nearby profiles found.</p>
        ) : null}

        <div className="space-y-3">
          {profiles.map((profile) => (
            <article key={profile.id} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
              <div className="mb-2 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-gray-900">{profile.nickname}</h2>
                <span className="text-xs text-gray-500">{(profile.distance_meters / 1000).toFixed(1)} km</span>
              </div>
              <p className="text-sm text-gray-600">Gender: {profile.gender}</p>
              <p className="mt-1 text-sm text-gray-700">{profile.bio || "No bio yet."}</p>
              <button
                onClick={() => handleLike(profile.id)}
                disabled={likingUserId === profile.id}
                className="mt-3 w-full rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-gray-700 disabled:opacity-60"
              >
                {likingUserId === profile.id ? "Liking..." : "Like"}
              </button>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
