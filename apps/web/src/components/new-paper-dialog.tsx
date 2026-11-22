import { useMutation, useQueryClient } from "@tanstack/react-query";
import { PlusIcon } from "lucide-react";
import { type FormEvent, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc, trpcClient } from "@/lib/trpc";
import { uploadPaperFile } from "@/lib/upload";

/** Adds a paper – into `folderId` when given, otherwise into the library root. */
export function NewPaperDialog({ folderId = null }: { folderId?: string | null }) {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();

  const create = useMutation({
    mutationFn: async ({ title, file }: { title: string; file: File | null }) => {
      const paper = await trpcClient.paper.create.mutate({
        title,
        withFile: Boolean(file),
        folderId,
      });
      if (file) await uploadPaperFile(paper.id, file);
      return paper;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: trpc.paper.pathKey() });
      setOpen(false);
      toast.success("Paper added");
    },
    onError: (error) => toast.error(error.message),
  });

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const file = form.get("file");
    const pdf = file instanceof File && file.size > 0 ? file : null;
    const title = String(form.get("title") ?? "").trim() || pdf?.name.replace(/\.pdf$/i, "") || "";
    if (!title) {
      toast.error("Please enter a title or choose a PDF");
      return;
    }
    create.mutate({ title, file: pdf });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <PlusIcon /> Add paper
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={onSubmit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>Add paper</DialogTitle>
            <DialogDescription>
              Upload a PDF or create an entry manually. Import via DOI and arXiv follows soon.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="title">Title</Label>
            <Input id="title" name="title" placeholder="Defaults to the file name" />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="file">PDF (optional)</Label>
            <Input id="file" name="file" type="file" accept="application/pdf" />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={create.isPending}>
              {create.isPending ? "Adding…" : "Add paper"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
