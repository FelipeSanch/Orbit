import json

from agno.tools.decorator import tool

from services.token_manager import TokenManager


def create_email_tools(token_manager: TokenManager, user_id: str) -> list:
    """Create Outlook Mail tool functions with credentials bound via closure."""

    async def _get_mailbox():
        account = await token_manager.get_account(user_id)
        return account.mailbox()

    @tool
    async def list_emails(folder: str = "inbox", max_results: int = 10) -> str:
        """List emails from Outlook mailbox.

        Args:
            folder: Folder to list from ('inbox', 'drafts', 'sent', 'deleted'). Default inbox.
            max_results: Maximum number of emails to return. Default 10.
        """
        mailbox = await _get_mailbox()

        folder_map = {
            "inbox": mailbox.inbox_folder,
            "drafts": mailbox.drafts_folder,
            "sent": mailbox.sent_folder,
            "deleted": mailbox.deleted_folder,
            "junk": mailbox.junk_folder,
        }
        get_folder = folder_map.get(folder.lower(), mailbox.inbox_folder)
        target = get_folder()

        messages = target.get_messages(limit=max_results)

        emails = []
        for msg in messages:
            sender = ""
            if msg.sender:
                sender = (
                    f"{msg.sender.name} <{msg.sender.address}>"
                    if msg.sender.name
                    else msg.sender.address
                )
            emails.append(
                {
                    "id": msg.object_id,
                    "subject": msg.subject or "(no subject)",
                    "from": sender,
                    "date": msg.received.isoformat() if msg.received else "",
                    "snippet": msg.body_preview or "",
                    "is_read": msg.is_read,
                    "has_attachments": msg.has_attachments,
                }
            )

        return json.dumps(emails)

    @tool
    async def get_email(email_id: str) -> str:
        """Get full content of a specific email.

        Args:
            email_id: The Outlook message ID.
        """
        mailbox = await _get_mailbox()
        msg = mailbox.get_message(object_id=email_id)

        if not msg:
            return json.dumps({"error": "Message not found"})

        sender = ""
        if msg.sender:
            sender = (
                f"{msg.sender.name} <{msg.sender.address}>"
                if msg.sender.name
                else msg.sender.address
            )

        to_list = []
        if msg.to:
            for recipient in msg.to:
                to_list.append(recipient.address if recipient else "")

        cc_list = []
        if msg.cc:
            for recipient in msg.cc:
                cc_list.append(recipient.address if recipient else "")

        return json.dumps(
            {
                "id": msg.object_id,
                "subject": msg.subject or "",
                "from": sender,
                "to": to_list,
                "cc": cc_list,
                "date": msg.received.isoformat() if msg.received else "",
                "body": msg.body or "",
                "is_read": msg.is_read,
                "has_attachments": msg.has_attachments,
                "importance": str(msg.importance) if msg.importance else "normal",
            }
        )

    @tool
    async def search_emails(query: str, max_results: int = 20) -> str:
        """Search emails using Outlook search syntax.

        Args:
            query: Search query (e.g. 'from:john subject:invoice'). Uses Microsoft Search KQL.
            max_results: Maximum results to return. Default 20.
        """
        mailbox = await _get_mailbox()
        q = mailbox.new_query().search(query)
        messages = mailbox.get_messages(query=q, limit=max_results)

        emails = []
        for msg in messages:
            sender = ""
            if msg.sender:
                sender = (
                    f"{msg.sender.name} <{msg.sender.address}>"
                    if msg.sender.name
                    else msg.sender.address
                )
            emails.append(
                {
                    "id": msg.object_id,
                    "subject": msg.subject or "(no subject)",
                    "from": sender,
                    "date": msg.received.isoformat() if msg.received else "",
                    "snippet": msg.body_preview or "",
                    "is_read": msg.is_read,
                }
            )

        return json.dumps(emails)

    @tool(requires_confirmation=True)
    async def send_email(to: str, subject: str, body: str, cc: str = "", bcc: str = "") -> str:
        """Send an email via Outlook.

        Args:
            to: Recipient email address (comma-separated for multiple).
            subject: Email subject line.
            body: Email body text.
            cc: CC recipients (comma-separated). Optional.
            bcc: BCC recipients (comma-separated). Optional.
        """
        mailbox = await _get_mailbox()
        msg = mailbox.new_message()

        for addr in to.split(","):
            msg.to.add(addr.strip())
        msg.subject = subject
        msg.body = body

        if cc:
            for addr in cc.split(","):
                msg.cc.add(addr.strip())
        if bcc:
            for addr in bcc.split(","):
                msg.bcc.add(addr.strip())

        # O365 msg.send() returns True on success, False on a non-raising
        # rejection by Graph (missing recipient, etc.). Surface False as
        # an exception so the tool_result lands as an error envelope
        # instead of a fake "sent" claim.
        if not msg.send():
            raise RuntimeError("Microsoft Graph rejected the send request.")

        return json.dumps({"status": "sent", "to": to, "subject": subject})

    @tool(requires_confirmation=True)
    async def reply_to_email(email_id: str, body: str, reply_all: bool = False) -> str:
        """Reply to an existing email.

        Args:
            email_id: The Outlook message ID to reply to.
            body: Reply body text.
            reply_all: Whether to reply to all recipients. Default false.
        """
        mailbox = await _get_mailbox()
        original = mailbox.get_message(object_id=email_id)

        if not original:
            return json.dumps({"error": "Original message not found"})

        reply = original.reply(to_all=reply_all)
        reply.body = body
        if not reply.send():
            raise RuntimeError("Microsoft Graph rejected the reply request.")

        return json.dumps(
            {
                "status": "sent",
                "in_reply_to": original.subject,
                "reply_all": reply_all,
            }
        )

    @tool(requires_confirmation=True)
    async def trash_email(email_id: str) -> str:
        """Move an email to the deleted items folder.

        Args:
            email_id: The Outlook message ID to delete.
        """
        mailbox = await _get_mailbox()
        msg = mailbox.get_message(object_id=email_id)

        if not msg:
            return json.dumps({"error": "Message not found"})

        msg.delete()

        return json.dumps({"status": "deleted", "id": email_id})

    @tool(requires_confirmation=True)
    async def move_email(email_id: str, destination_folder: str) -> str:
        """Move an email to a different folder.

        Args:
            email_id: The Outlook message ID to move.
            destination_folder: Target folder ('inbox', 'archive', 'junk', 'deleted').
        """
        mailbox = await _get_mailbox()
        msg = mailbox.get_message(object_id=email_id)

        if not msg:
            return json.dumps({"error": "Message not found"})

        folder_map = {
            "inbox": mailbox.inbox_folder,
            "junk": mailbox.junk_folder,
            "deleted": mailbox.deleted_folder,
        }
        get_folder = folder_map.get(destination_folder.lower())
        if get_folder:
            msg.move(get_folder())
        else:
            msg.move(destination_folder)  # Try as folder ID or name

        return json.dumps({"status": "moved", "id": email_id, "folder": destination_folder})

    @tool
    async def get_attachments(email_id: str) -> str:
        """Get attachment names and content from an email.

        Reads text-based attachments (txt, csv, html, json, etc.) inline.
        For binary files (images, PDFs, etc.), returns name and size only.

        Args:
            email_id: The Outlook message ID.
        """
        import base64

        mailbox = await _get_mailbox()
        msg = mailbox.get_message(object_id=email_id)

        if not msg:
            return json.dumps({"error": "Message not found"})

        if not msg.has_attachments:
            return json.dumps({"message": "No attachments"})

        msg.attachments.download_attachments()
        attachments = []

        text_extensions = {
            ".txt", ".csv", ".html", ".htm", ".json",
            ".xml", ".md", ".log", ".py", ".js", ".ts",
        }

        for att in msg.attachments:
            name = att.name or "unnamed"
            ext = name.rsplit(".", 1)[-1].lower() if "." in name else ""
            info = {
                "name": name,
                "size": att.size or 0,
            }

            if f".{ext}" in text_extensions and att.content:
                try:
                    raw = att.content
                    if isinstance(raw, str):
                        raw = base64.b64decode(raw)
                    text = raw.decode("utf-8", errors="replace")
                    if len(text) > 8000:
                        text = text[:8000] + "\n... (truncated)"
                    info["content"] = text
                except Exception:
                    info["content"] = "(could not decode)"
            else:
                info["content"] = f"(binary .{ext} file)"

            attachments.append(info)

        return json.dumps(attachments)

    return [
        list_emails,
        get_email,
        search_emails,
        send_email,
        reply_to_email,
        trash_email,
        move_email,
        get_attachments,
    ]
