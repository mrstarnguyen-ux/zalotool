export interface IncomingMessage {
    accountId: string;
    senderUid: string;
    senderName: string;
    content: string;
    contentType: string;
    msgId: string;
    timestamp: number;
    isSelf: boolean;
    threadId: string;
    threadType: "user" | "group";
    groupName?: string;
    attachments?: any[];
    /**
     * FIX: recipientUid — only set for self-sent DMs (isSelf=true, threadType=user).
     * This is the UID of the contact on the OTHER end of the conversation.
     * Used to upsert the contact record when the agent sends first.
     */
    recipientUid?: string;
}
export interface HandleMessageResult {
    message: {
        id: string;
        conversationId: string;
        zaloMsgId: string | null;
        senderType: string;
        senderUid: string | null;
        senderName: string | null;
        content: string | null;
        contentType: string;
        attachments: any;
        isDeleted: boolean;
        deletedAt: Date | null;
        sentAt: Date;
        repliedByUserId: string | null;
        createdAt: Date;
    };
    conversationId: string;
    orgId: string;
    contactId: string | null;
}
export declare function handleIncomingMessage(msg: IncomingMessage): Promise<HandleMessageResult | null>;
export declare function handleMessageUndo(accountId: string, zaloMsgId: string): Promise<void>;
//# sourceMappingURL=message-handler.d.ts.map