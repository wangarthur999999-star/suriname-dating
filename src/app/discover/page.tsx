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

function getDistanceLabel(distanceMeters: number) {
  if (distanceMeters < 1000) {
    return "< 1 km";
  }

  if (distanceMeters < 3000) {
    return "1–3 km";
  }

  if (distanceMeters < 10000) {
    return "3–10 km";
  }

  return "10+ km";
}

export default function DiscoverPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [profiles, setProfiles] = useState<NearbyProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [locationNotice, setLocationNotice] = useState<string | null>(null);
  const [likingUserId, setLikingUserId] = useState<string | null>(null);
  const [likedUserId, setLikedUserId] = useState<string | null>(null);

  useEffect(() => {
    const loadProfiles = async () => {
      setLoading(true);
      setErrorMessage(null);
      setLocationNotice(null);

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

      const fetchNearbyProfiles = async (lat: number, lng: number) => {
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
      };

      if (!navigator.geolocation) {
        setLocationNotice("Location not enabled. Showing people in Paramaribo.");
        await fetchNearbyProfiles(5.852, -55.203);
        return;
      }

      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const { latitude: lat, longitude: lng } = position.coords;
          await fetchNearbyProfiles(lat, lng);
        },
        async (geoError) => {
          console.error(geoError);
          setLocationNotice("Location not enabled. Showing people in Paramaribo.");
          await fetchNearbyProfiles(5.852, -55.203);
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      );
    };

    void loadProfiles();
  }, [router, supabase]);

  const handleLike = async (targetUserId: string) => {
    if (!currentUserId || likingUserId || likedUserId) {
      return;
    }

    setErrorMessage(null);
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
        setErrorMessage(likeError.message);
        return;
      }

      if (likeError && isDuplicateLike) {
        console.error(likeError);
      }

      setLikingUserId(null);
      setLikedUserId(targetUserId);

      const { data: isMatch, error: matchError } = await supabase.rpc("has_mutual_like", {
        user_a: currentUserId,
        user_b: targetUserId,
      });

      if (matchError) {
        console.error(matchError);
        setErrorMessage(matchError.message);
      } else if (isMatch) {
        alert("It's a match! Check Matches to chat on WhatsApp.");
      }

      await new Promise((resolve) => setTimeout(resolve, 300));
      setProfiles((prev) => prev.filter((profile) => profile.id !== targetUserId));
      setLikedUserId(null);
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

        {locationNotice ? (
          <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">{locationNotice}</p>
        ) : null}

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
                <span className="text-xs text-gray-500">{getDistanceLabel(profile.distance_meters)}</span>
              </div>
              <p className="text-sm text-gray-500">Active nearby</p>
              <p className="text-sm text-gray-600">Gender: {profile.gender}</p>
              <p className="mt-1 text-sm text-gray-700">{profile.bio || "No bio yet."}</p>
              <button
                onClick={() => handleLike(profile.id)}
                disabled={Boolean(likingUserId || likedUserId)}
                className="mt-3 w-full rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-gray-700 disabled:opacity-60"
              >
                {likingUserId === profile.id
                  ? "Liking..."
                  : likedUserId === profile.id
                    ? `You liked ${profile.nickname} ✔`
                    : "Like"}
              </button>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
