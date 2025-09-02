// src/components/NotesEditor.tsx
import { memo, useCallback, useEffect, useRef, useState } from "react";
import Button from "./Button";

type Props = {
  entryId: string;
  initialText: string;
  isEditing: boolean;
  serverUrl: string;
  className?: string;
  // optional callback so parent can merge the updated entry
  onSaved?: (updatedEntry: any) => void;
};

function NotesEditorImpl({
  entryId,
  initialText,
  isEditing,
  serverUrl,
  className,
  onSaved,
}: Props) {
  // keep a stable draft that doesn't reset while user types
  const [draft, setDraft] = useState(initialText || "");
  const [saving, setSaving] = useState(false);

  // only reset draft when entryId changes (new row) or server text actually changed
  const lastEntryIdRef = useRef(entryId);
  const lastInitialRef = useRef(initialText);
  useEffect(() => {
    const idChanged = lastEntryIdRef.current !== entryId;
    const serverChanged = lastInitialRef.current !== initialText;
    if (idChanged || serverChanged) {
      setDraft(initialText || "");
      lastEntryIdRef.current = entryId;
      lastInitialRef.current = initialText;
    }
  }, [entryId, initialText]);

  const hasChanges = draft !== (initialText || "");

  const save = useCallback(async () => {
    if (!hasChanges || saving) return;
    setSaving(true);
    try {
      const r = await fetch(`${serverUrl}/timesheet/notes/${entryId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ notes: draft }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.message || "Failed to save notes");
      onSaved?.(j.updatedTimesheetEntry);
    } catch (e) {
      // let parent control toasts if preferred; minimal here:
      console.error(e);
    } finally {
      setSaving(false);
    }
  }, [draft, entryId, hasChanges, saving, serverUrl, onSaved]);

  if (!isEditing) {
    return <span className={className}>{initialText || ""}</span>;
  }

  return (
    <div className={`flex flex-col gap-2 min-w-[260px] ${className || ""}`}>
      <textarea
        onClick={(e) => e.stopPropagation()}
        className="w-full rounded-md border px-2 py-1 text-sm"
        rows={3}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder="Type notes, then click Save"
      />
      <div className="flex items-center gap-2">
        <Button
          className="px-2 py-1 text-xs"
          onClick={(e) => {
            e.stopPropagation();
            save();
          }}
          disabled={saving || !hasChanges}
        // title={!hasChanges ? "No changes to save" : "Save notes"}
        >
          {saving ? "Saving…" : "Save Notes"}
        </Button>
        {!hasChanges && (
          <span className="text-xs text-gray-500">No changes</span>
        )}
      </div>
    </div>
  );
}

// avoid re-render unless one of these shallow props changes
const NotesEditor = memo(NotesEditorImpl, (prev, next) => {
  return (
    prev.entryId === next.entryId &&
    prev.initialText === next.initialText &&
    prev.isEditing === next.isEditing &&
    prev.serverUrl === next.serverUrl
  );
});

export default NotesEditor;
