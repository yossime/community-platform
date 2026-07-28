import * as React from 'react';
import {
  Html,
  Head,
  Body,
  Container,
  Text,
  Button,
  Hr,
  Section,
  Heading,
  Preview,
} from '@react-email/components';
import type { PasswordResetEmailProps } from '../types';

const primaryColor = '#2563eb';

const main: React.CSSProperties = {
  backgroundColor: '#f6f9fc',
  fontFamily:
    "'Heebo', 'Rubik', 'Noto Sans Hebrew', 'Arial Hebrew', Arial, sans-serif",
  direction: 'rtl',
};

const container: React.CSSProperties = {
  backgroundColor: '#ffffff',
  margin: '0 auto',
  padding: '40px 32px',
  maxWidth: '580px',
  borderRadius: '8px',
  border: '1px solid #e5e7eb',
};

const logo: React.CSSProperties = {
  fontSize: '24px',
  fontWeight: 700,
  color: primaryColor,
  textAlign: 'center',
  margin: '0 0 24px 0',
};

const heading: React.CSSProperties = {
  fontSize: '22px',
  fontWeight: 700,
  color: '#111827',
  textAlign: 'right',
  margin: '0 0 16px 0',
};

const paragraph: React.CSSProperties = {
  fontSize: '16px',
  lineHeight: '26px',
  color: '#374151',
  textAlign: 'right',
  margin: '0 0 16px 0',
};

const buttonContainer: React.CSSProperties = {
  textAlign: 'center',
  margin: '32px 0',
};

const button: React.CSSProperties = {
  backgroundColor: primaryColor,
  borderRadius: '6px',
  color: '#ffffff',
  fontSize: '16px',
  fontWeight: 600,
  textDecoration: 'none',
  textAlign: 'center',
  display: 'inline-block',
  padding: '12px 32px',
};

const warningText: React.CSSProperties = {
  fontSize: '14px',
  lineHeight: '22px',
  color: '#6b7280',
  textAlign: 'right',
  margin: '0 0 16px 0',
};

const hr: React.CSSProperties = {
  borderColor: '#e5e7eb',
  margin: '24px 0',
};

const footer: React.CSSProperties = {
  fontSize: '13px',
  lineHeight: '22px',
  color: '#9ca3af',
  textAlign: 'center',
  margin: '0',
};

export default function PasswordResetEmail({
  displayName,
  resetUrl,
}: PasswordResetEmailProps) {
  return (
    <Html lang="he" dir="rtl">
      <Head />
      <Preview>{"איפוס סיסמה - קהילת אנשי מקצוע"}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Text style={logo}>{"קהילת אנשי מקצוע"}</Text>

          <Heading style={heading}>{"איפוס סיסמה"}</Heading>

          <Text style={paragraph}>
            {"שלום"} {displayName}{","}
          </Text>

          <Text style={paragraph}>
            {
              "קיבלנו בקשה לאיפוס הסיסמה של החשבון שלך. לחץ על הכפתור למטה כדי ליצור סיסמה חדשה:"
            }
          </Text>

          <Section style={buttonContainer}>
            <Button style={button} href={resetUrl}>
              {"איפוס סיסמה"}
            </Button>
          </Section>

          <Text style={warningText}>
            {
              "הקישור תקף ל-60 דקות. לאחר מכן תצטרך לבקש קישור חדש."
            }
          </Text>

          <Text style={paragraph}>
            {
              "אם לא ביקשת לאפס את הסיסמה, ניתן להתעלם מהודעה זו. הסיסמה שלך לא תשתנה."
            }
          </Text>

          <Hr style={hr} />

          <Text style={footer}>
            {
              "קהילת אנשי מקצוע - הפלטפורמה המקצועית לקהילה החרדית"
            }
          </Text>
        </Container>
      </Body>
    </Html>
  );
}
