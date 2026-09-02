/**
 * useInboxDeepLinks — `/inbox?conversation=<id>` and `/inbox?human=<id>`
 * (Debt 10). Extracted from InboxWorkspaceController.jsx.
 *
 * Both params are one-shot: once acted on they are removed from the URL (a
 * replace, not a push) so navigating back into /inbox doesn't keep snapping
 * to the same thread. Both wait for the list to load so the id can be
 * verified before selecting — otherwise selectConversation would fetch a
 * non-existent conversation and the list pane would show an empty selection.
 * The `?filter=` mode param is left untouched.
 */
import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";

export interface DeepLinkConversation {
  id: string;
  human_id?: string | null;
}

export interface UseInboxDeepLinksOptions<T extends DeepLinkConversation> {
  conversations: T[];
  loadingList: boolean;
  selectedId: string | null;
  selectConversation: (id: string) => unknown;
  /** ?human= with an existing thread: open it and focus the reply box. */
  onFocusComposer: () => void;
  /** ?human= with no thread yet: open the new-message composer pre-targeted
   *  at that customer so first contact works too. */
  onComposeForHuman: (humanId: string) => void;
}

export function useInboxDeepLinks<T extends DeepLinkConversation>({
  conversations,
  loadingList,
  selectedId,
  selectConversation,
  onFocusComposer,
  onComposeForHuman,
}: UseInboxDeepLinksOptions<T>) {
  const [searchParams, setSearchParams] = useSearchParams();

  // Deep-link: open ?conversation=<id> on first load (and whenever the URL
  // changes externally, e.g. dashboard rows that navigate to a specific chat).
  const targetConversationId = searchParams.get("conversation");
  useEffect(() => {
    if (!targetConversationId) return;
    if (loadingList) return;
    if (selectedId === targetConversationId) return;
    const exists = conversations.some((c) => c.id === targetConversationId);
    if (!exists) return;
    selectConversation(targetConversationId);
    const next = new URLSearchParams(searchParams);
    next.delete("conversation");
    setSearchParams(next, { replace: true });
  }, [targetConversationId, loadingList, conversations, selectedId, selectConversation, searchParams, setSearchParams]);

  // Deep-link by human: ?human=<id> lands staff in that human's WhatsApp/SMS
  // ready to type. Callers like "Message owner" only know the human id, so
  // resolve human_id → conversation here (mirrors the ?conversation= effect).
  const targetHumanId = searchParams.get("human");
  useEffect(() => {
    if (!targetHumanId) return;
    if (loadingList) return;
    const conv = conversations.find((c) => c.human_id === targetHumanId);
    if (conv) {
      if (selectedId !== conv.id) selectConversation(conv.id);
      onFocusComposer();
    } else {
      onComposeForHuman(targetHumanId);
    }
    const next = new URLSearchParams(searchParams);
    next.delete("human");
    setSearchParams(next, { replace: true });
  }, [targetHumanId, loadingList, conversations, selectedId, selectConversation, onFocusComposer, onComposeForHuman, searchParams, setSearchParams]);
}
