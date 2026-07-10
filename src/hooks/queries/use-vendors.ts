import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export const vendorKeys = {
  all: ["vendors"] as const,
  lists: () => [...vendorKeys.all, "list"] as const,
};

export interface Vendor {
  id: string;
  name: string;
  description: string | null;
  risk_level: "low" | "medium" | "high";
  status: "active" | "inactive";
  created_at: string;
  updated_at: string;
  user_id: string;
}

export function useVendors() {
  return useQuery<Vendor[]>({
    queryKey: vendorKeys.lists(),
    queryFn: async () => {
      const res = await fetch("/api/compliance/vendors");
      if (!res.ok) throw new Error("Failed to load vendors");
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Failed to load vendors");
      return data.data ?? [];
    },
    staleTime: 60_000,
  });
}

export function useCreateVendor() {
  const queryClient = useQueryClient();
  return useMutation<Vendor, Error, Partial<Vendor>>({
    mutationFn: async (newVendor) => {
      const res = await fetch("/api/compliance/vendors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newVendor),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Failed to create vendor");
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: vendorKeys.all });
    },
  });
}

export function useUpdateVendor() {
  const queryClient = useQueryClient();
  return useMutation<Vendor, Error, { id: string; data: Partial<Vendor> }>({
    mutationFn: async ({ id, data }) => {
      const res = await fetch(`/api/compliance/vendors/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const resData = await res.json();
      if (!res.ok || !resData.success) throw new Error(resData.error || "Failed to update vendor");
      return resData.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: vendorKeys.all });
    },
  });
}

export function useDeleteVendor() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: async (id) => {
      const res = await fetch(`/api/compliance/vendors/${id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Failed to delete vendor");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: vendorKeys.all });
    },
  });
}
