import { generateAuthenticationOptions, generateRegistrationOptions, verifyAuthenticationResponse, verifyRegistrationResponse } from '@simplewebauthn/server';
import { isoBase64URL } from '@simplewebauthn/server/helpers';
import type {
  AuthenticationResponseJSON,
  AuthenticatorTransport,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON,
} from '@simplewebauthn/server';
import type { PasskeyRow } from '../db/passkeys';

export const RP_NAME = 'Spinecast';

// The RP ID and origin come from the request rather than configuration, so
// local dev, staging and production are each correct on their own hostname.
// Cloudflare routes by hostname, so Host is not client-chosen here.
export const rpFrom = (requestUrl: string): { rpID: string; origin: string } => {
  const url = new URL(requestUrl);
  return { rpID: url.hostname, origin: url.origin };
};

const transportsOf = (row: PasskeyRow): AuthenticatorTransport[] | undefined => {
  const list = row.transports.split(',').filter((t) => t.length > 0) as AuthenticatorTransport[];
  return list.length > 0 ? list : undefined;
};

export const registrationOptions = async (args: {
  requestUrl: string;
  userId: string;
  email: string;
  existing: PasskeyRow[];
}): Promise<PublicKeyCredentialCreationOptionsJSON> => {
  const { rpID } = rpFrom(args.requestUrl);
  return generateRegistrationOptions({
    rpName: RP_NAME,
    rpID,
    userID: Uint8Array.from(new TextEncoder().encode(args.userId)),
    userName: args.email,
    userDisplayName: args.email,
    attestationType: 'none',
    authenticatorSelection: { residentKey: 'required', userVerification: 'preferred' },
    excludeCredentials: args.existing.map((row) => {
      const transports = transportsOf(row);
      return transports ? { id: row.id, transports } : { id: row.id };
    }),
  });
};

export const verifyRegistration = async (args: {
  requestUrl: string;
  expectedChallenge: string;
  response: RegistrationResponseJSON;
}): Promise<{ id: string; publicKey: string; counter: number; transports: string }> => {
  const { rpID, origin } = rpFrom(args.requestUrl);
  const result = await verifyRegistrationResponse({
    response: args.response,
    expectedChallenge: args.expectedChallenge,
    expectedOrigin: origin,
    expectedRPID: rpID,
    // The options ask for 'preferred', so requiring UV here would reject any
    // authenticator that legitimately did not perform it. The library defaults
    // this to true.
    requireUserVerification: false,
  });
  if (!result.verified || !result.registrationInfo) throw new Error('registration not verified');
  const cred = result.registrationInfo.credential;
  return {
    id: cred.id,
    publicKey: isoBase64URL.fromBuffer(cred.publicKey),
    counter: cred.counter,
    transports: (cred.transports ?? []).join(','),
  };
};

export const authenticationOptions = async (requestUrl: string): Promise<PublicKeyCredentialRequestOptionsJSON> => {
  const { rpID } = rpFrom(requestUrl);
  return generateAuthenticationOptions({ rpID, allowCredentials: [], userVerification: 'preferred' });
};

export const verifyAuthentication = async (args: {
  requestUrl: string;
  expectedChallenge: string;
  response: AuthenticationResponseJSON;
  row: PasskeyRow;
}): Promise<number> => {
  const { rpID, origin } = rpFrom(args.requestUrl);
  // The counter check lives inside the library: it throws when
  // (counter > 0 || stored > 0) && counter <= stored. A stored 0 with a
  // presented 0 is a normal iCloud Keychain login, so do not add a second check.
  const result = await verifyAuthenticationResponse({
    response: args.response,
    expectedChallenge: args.expectedChallenge,
    expectedOrigin: origin,
    expectedRPID: rpID,
    credential: {
      id: args.row.id,
      publicKey: isoBase64URL.toBuffer(args.row.public_key),
      counter: args.row.counter,
      transports: transportsOf(args.row),
    },
    requireUserVerification: false,
  });
  if (!result.verified) throw new Error('authentication not verified');
  return result.authenticationInfo.newCounter;
};
