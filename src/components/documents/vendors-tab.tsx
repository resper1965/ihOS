import React, { useState } from "react";
import {
  Building2,
  Trash2,
  Plus,
  Search,
  FileText,
  Loader2,
  Edit2
} from "lucide-react";
import {
  useVendors,
  useCreateVendor,
  useDeleteVendor,
  useUpdateVendor,
  type Vendor
} from "@/hooks/queries/use-vendors";
import { useDocuments } from "@/hooks/queries/use-documents";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";

export function VendorsTab() {
  const { data: vendors = [], isLoading: loadingVendors } = useVendors();
  const { data: documents = [] } = useDocuments(null);
  
  const createVendor = useCreateVendor();
  const deleteVendor = useDeleteVendor();
  const updateVendor = useUpdateVendor();

  const [search, setSearch] = useState("");
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editingVendor, setEditingVendor] = useState<Vendor | null>(null);

  // Form states
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [riskLevel, setRiskLevel] = useState<"low" | "medium" | "high">("low");

  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    try {
      await createVendor.mutateAsync({
        name: name.trim(),
        description: description.trim() || null,
        risk_level: riskLevel,
        status: "active"
      });
      setName("");
      setDescription("");
      setRiskLevel("low");
      setIsAddOpen(false);
    } catch (err) {
      console.error(err);
    }
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingVendor || !name.trim()) return;

    try {
      await updateVendor.mutateAsync({
        id: editingVendor.id,
        data: {
          name: name.trim(),
          description: description.trim() || null,
          risk_level: riskLevel
        }
      });
      setName("");
      setDescription("");
      setRiskLevel("low");
      setEditingVendor(null);
      setIsEditOpen(false);
    } catch (err) {
      console.error(err);
    }
  };

  const handleDelete = async (id: string) => {
    if (window.confirm("Are you sure you want to delete this supplier? This will not delete their associated documents but will remove the link.")) {
      try {
        await deleteVendor.mutateAsync(id);
      } catch (err) {
        console.error(err);
      }
    }
  };

  const openEdit = (vendor: Vendor) => {
    setEditingVendor(vendor);
    setName(vendor.name);
    setDescription(vendor.description || "");
    setRiskLevel(vendor.risk_level);
    setIsEditOpen(true);
  };

  const filtered = vendors.filter((v) =>
    v.name.toLowerCase().includes(search.toLowerCase()) ||
    (v.description || "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        {/* Search */}
        <div className="relative max-w-md flex-1">
          <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5">
            <Search className="h-4 w-4 text-text-muted" />
          </div>
          <input
            type="text"
            placeholder="Search suppliers..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-xl border border-border-glass bg-white/5 py-2.5 pl-10 pr-4 text-sm text-text-primary outline-none transition-all duration-300 focus:border-primary/50 focus:bg-white/[0.07] focus:ring-2 focus:ring-primary/20"
          />
        </div>

        <Button
          variant="primary"
          icon={<Plus className="h-4 w-4" />}
          onClick={() => setIsAddOpen(true)}
        >
          Add Supplier
        </Button>
      </div>

      {loadingVendors ? (
        <div className="flex h-48 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="glass-card flex flex-col items-center justify-center p-12 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/20 to-accent/20 mb-4">
            <Building2 className="h-8 w-8 text-primary" />
          </div>
          <h3 className="text-lg font-semibold text-text-primary mb-1">
            No suppliers yet
          </h3>
          <p className="text-sm text-text-muted max-w-sm">
            Add your third-party suppliers (e.g. AWS, Supabase, Vercel) to link and monitor their compliance documents.
          </p>
          <Button
            variant="primary"
            className="mt-6"
            icon={<Plus className="h-4 w-4" />}
            onClick={() => setIsAddOpen(true)}
          >
            Add Your First Supplier
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((vendor) => {
            const vendorDocs = documents.filter((d) => d.vendor_id === vendor.id);
            const riskColors = {
              high: "bg-red-500/10 text-red-400 border-red-500/20",
              medium: "bg-amber-500/10 text-amber-400 border-amber-500/20",
              low: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
            };

            return (
              <div
                key={vendor.id}
                className="glass-card group flex flex-col justify-between p-6 transition-all duration-300 hover:border-primary/30 hover:shadow-xl hover:shadow-primary/5"
              >
                <div className="space-y-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary/20 to-accent/20 shrink-0">
                        <Building2 className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <h4 className="font-bold text-text-primary leading-tight">
                          {vendor.name}
                        </h4>
                        <Badge
                          variant="neutral"
                          className={`mt-1.5 text-[9px] uppercase font-mono px-2 py-0.5 border ${riskColors[vendor.risk_level]}`}
                        >
                          {vendor.risk_level} risk
                        </Badge>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                      <button
                        onClick={() => openEdit(vendor)}
                        className="rounded-lg p-1.5 hover:bg-white/10 text-text-muted hover:text-primary transition-all"
                        aria-label="Edit supplier"
                      >
                        <Edit2 className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => handleDelete(vendor.id)}
                        className="rounded-lg p-1.5 hover:bg-red-500/10 text-text-muted hover:text-red-400 transition-all"
                        aria-label="Delete supplier"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>

                  <p className="text-xs text-text-secondary leading-relaxed line-clamp-3">
                    {vendor.description || "No description provided."}
                  </p>
                </div>

                <div className="mt-6 flex items-center justify-between border-t border-white/5 pt-4 text-xs text-text-secondary">
                  <span className="flex items-center gap-1.5 text-text-muted">
                    <FileText className="h-3.5 w-3.5" />
                    {vendorDocs.length} {vendorDocs.length === 1 ? "document" : "documents"}
                  </span>
                  <span className="text-[10px] text-text-muted font-mono">
                    Added {new Date(vendor.created_at).toLocaleDateString()}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add Dialog */}
      <Dialog
        open={isAddOpen}
        onClose={() => {
          setIsAddOpen(false);
          setName("");
          setDescription("");
          setRiskLevel("low");
        }}
        title="Add Supplier"
        maxWidth="max-w-md"
      >
        <form onSubmit={handleAddSubmit} className="space-y-4 mt-4">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-text-secondary" htmlFor="add-name">
              Name *
            </label>
            <input
              id="add-name"
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-xl border border-border-glass bg-white/5 px-3 py-2 text-sm text-text-primary outline-none transition-all focus:border-primary/50"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-text-secondary" htmlFor="add-description">
              Description
            </label>
            <textarea
              id="add-description"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full rounded-xl border border-border-glass bg-white/5 px-3 py-2 text-sm text-text-primary outline-none transition-all focus:border-primary/50 resize-none"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-text-secondary">
              Risk Level
            </label>
            <div className="grid grid-cols-3 gap-2">
              {(["low", "medium", "high"] as const).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRiskLevel(r)}
                  className={`rounded-xl border px-3 py-2 text-xs font-semibold uppercase transition-all ${
                    riskLevel === r
                      ? r === "high"
                        ? "border-red-500/30 bg-red-500/10 text-red-400"
                        : r === "medium"
                        ? "border-amber-500/30 bg-amber-500/10 text-amber-400"
                        : "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                      : "border-white/5 bg-white/5 text-text-secondary hover:bg-white/8"
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setIsAddOpen(false);
                setName("");
                setDescription("");
                setRiskLevel("low");
              }}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={createVendor.isPending}>
              {createVendor.isPending ? "Adding..." : "Add Supplier"}
            </Button>
          </div>
        </form>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog
        open={isEditOpen}
        onClose={() => {
          setIsEditOpen(false);
          setEditingVendor(null);
          setName("");
          setDescription("");
          setRiskLevel("low");
        }}
        title="Edit Supplier"
        maxWidth="max-w-md"
      >
        <form onSubmit={handleEditSubmit} className="space-y-4 mt-4">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-text-secondary" htmlFor="edit-name">
              Name *
            </label>
            <input
              id="edit-name"
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-xl border border-border-glass bg-white/5 px-3 py-2 text-sm text-text-primary outline-none transition-all focus:border-primary/50"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-text-secondary" htmlFor="edit-description">
              Description
            </label>
            <textarea
              id="edit-description"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full rounded-xl border border-border-glass bg-white/5 px-3 py-2 text-sm text-text-primary outline-none transition-all focus:border-primary/50 resize-none"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-text-secondary">
              Risk Level
            </label>
            <div className="grid grid-cols-3 gap-2">
              {(["low", "medium", "high"] as const).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRiskLevel(r)}
                  className={`rounded-xl border px-3 py-2 text-xs font-semibold uppercase transition-all ${
                    riskLevel === r
                      ? r === "high"
                        ? "border-red-500/30 bg-red-500/10 text-red-400"
                        : r === "medium"
                        ? "border-amber-500/30 bg-amber-500/10 text-amber-400"
                        : "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                      : "border-white/5 bg-white/5 text-text-secondary hover:bg-white/8"
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setIsEditOpen(false);
                setEditingVendor(null);
                setName("");
                setDescription("");
                setRiskLevel("low");
              }}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={updateVendor.isPending}>
              {updateVendor.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
