import * as React from 'react';
import {
  Html,
  Head,
  Body,
  Container,
  Text,
  Hr,
  Section,
  Heading,
  Preview,
} from '@react-email/components';
import type { VerificationEmailProps } from '../types';

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

const codeContainer: React.CSSProperties = {
  textAlign: 'center',
  margin: '32px 0',
};

const codeBox: React.CSSProperties = {
  backgroundColor: '#f3f4f6',
  borderRadius: '8px',
  padding: '24px',
  display: 'inline-block',
};

const codeText: React.CSSProperties = {
  fontSize: '36px',
  fontWeight: 700,
  fontFamily: "'Courier New', Courier, monospace",
  letterSpacing: '8px',
  color: '#111827',
  margin: '0',
  direction: 'ltr',
};

const expirationText: React.CSSProperties = {
  fontSize: '14px',
  lineHeight: '22px',
  color: '#6b7280',
  textAlign: 'center',
  margin: '16px 0 0 0',
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

export default function VerificationEmail({
  code,
  expiresInMinutes,
}: VerificationEmailProps) {
  return (
    <Html lang="he" dir="rtl">
      <Head />
      <Preview>{"קוד האימות שלך: "}{code}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Text style={logo}>{"קהילת אנשי מקצוע"}</Text>

          <Heading style={heading}>{"קוד אימות"}</Heading>

          <Text style={paragraph}>
            {"השתמש בקוד הבא כדי לאמת את חשבונך:"}
          </Text>

          <Section style={codeContainer}>
            <Section style={codeBox}>
              <Text style={codeText}>{code}</Text>
            </Section>
            <Text style={expirationText}>
              {"הקוד תקף ל-"}{expiresInMinutes}{" דקות"}
            </Text>
          </Section>

          <Text style={paragraph}>
            {
              "אם לא ביקשת קוד אימות, ניתן להתעלם מהודעה זו. ייתכן שמישהו הזין את כתובת הדוא\"ל שלך בטעות."
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
