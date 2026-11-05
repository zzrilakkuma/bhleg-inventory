"use client";

import { RoleGate } from '../role-gate';
import Rules from './sections/Rules';
import Members from './sections/Members';
import Emergency from './sections/Emergency';

export default function SettingsPage() {
  return (
    <RoleGate accountant>
      <h1 className="text-xl font-bold mb-4">設定</h1>
      <section id="rules" className="scroll-mt-4"><Rules /></section>
      <section id="members" className="scroll-mt-4"><Members /></section>
      <section id="emergency" className="scroll-mt-4"><Emergency /></section>
    </RoleGate>
  );
}
