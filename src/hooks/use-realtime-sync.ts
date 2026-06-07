import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * Custom React hook that subscribes to PostgreSQL changes for a table
 * and invokes a callback whenever an insert, update, or delete occurs.
 *
 * @param table The table name to subscribe to
 * @param callback The function to invoke on changes
 */
export function useRealtimeSync(
  table: string,
  callback: (payload: any) => void
) {
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`realtime-sync-${table}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: table,
        },
        (payload) => {
          callback(payload);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [table, callback]);
}
