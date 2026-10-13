import smtplib
import secrets
import string
import datetime
import hashlib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
import logging

from config import settings
from database import get_db_connection

logger = logging.getLogger(__name__)

def generate_otp(length=6):
    return ''.join(secrets.choice(string.digits) for _ in range(length))


def _hash_otp(otp):
    return hashlib.sha256(otp.encode("utf-8")).hexdigest()

def send_otp_email(to_email, otp):
    try:
        msg = MIMEMultipart()
        msg['From'] = settings.mail_default_sender
        msg['To'] = to_email
        msg['Subject'] = "Your Password Reset OTP - Smart Campus"

        body = f"""
        <html>
            <body>
                <h2>Password Reset</h2>
                <p>You requested a password reset for your Smart Campus account.</p>
                <p>Your One-Time Password (OTP) is: <strong style="font-size: 24px;">{otp}</strong></p>
                <p>This OTP will expire in 15 minutes.</p>
                <p>If you did not request this, please ignore this email.</p>
            </body>
        </html>
        """
        msg.attach(MIMEText(body, 'html'))

        server = smtplib.SMTP(settings.smtp_server, settings.smtp_port)
        server.starttls()
        
        # Only login if credentials are provided (some local SMTPs don't need it)
        if settings.smtp_username and settings.smtp_password:
            server.login(settings.smtp_username, settings.smtp_password)
            
        server.send_message(msg)
        server.quit()
        return True
    except Exception as e:
        logger.error(f"Failed to send OTP email to {to_email}: {str(e)}")
        return False

def create_and_store_otp(email, institution_id=None):
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                # Check if user exists (tenant-scoped when institution_id given)
                cur.execute(
                    "SELECT id FROM users WHERE LOWER(email) = LOWER(%s) AND (%s IS NULL OR institution_id = %s)",
                    (email, institution_id, institution_id),
                )
                if not cur.fetchone():
                    return None # User not found

                otp = generate_otp()
                otp_hash = _hash_otp(otp)
                expires_at = datetime.datetime.now(datetime.UTC) + datetime.timedelta(minutes=15)

                # Invalidate old OTPs
                cur.execute("UPDATE password_reset_otps SET is_used = TRUE WHERE LOWER(email) = LOWER(%s)", (email,))

                # Store OTP hash (password_reset_otps has no institution_id column;
                # tenant binding is enforced via the users lookup above + the
                # institution-scoped password UPDATE in the reset route)
                cur.execute(
                    """
                    INSERT INTO password_reset_otps (email, otp, expires_at)
                    VALUES (%s, %s, %s)
                    """,
                    (email, otp_hash, expires_at)
                )
                return otp
    except Exception as e:
        logger.error(f"Failed to store OTP for {email}: {str(e)}")
        return None

def verify_and_use_otp(email, otp, institution_id=None):
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                # Tenant check first: user must exist in this institution
                cur.execute(
                    "SELECT id FROM users WHERE LOWER(email) = LOWER(%s) AND (%s IS NULL OR institution_id = %s)",
                    (email, institution_id, institution_id),
                )
                if not cur.fetchone():
                    return False
                otp_hash = _hash_otp(otp)
                cur.execute(
                    """
                    SELECT id FROM password_reset_otps
                    WHERE LOWER(email) = LOWER(%s)
                      AND otp = %s
                      AND is_used = FALSE
                      AND expires_at > %s
                    ORDER BY created_at DESC LIMIT 1
                    """,
                    (email, otp_hash, datetime.datetime.now(datetime.UTC))
                )

                record = cur.fetchone()
                if record:
                    # Mark as used
                    cur.execute("UPDATE password_reset_otps SET is_used = TRUE WHERE id = %s", (record[0],))
                    return True
        return False
    except Exception as e:
        logger.error(f"Failed to verify OTP for {email}: {str(e)}")
        return False
