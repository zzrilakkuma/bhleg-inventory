"use client";

import { RoleGate } from '../role-gate';
import Rules from './sections/Rules';

export default function SettingsPage() {
  return (
    <RoleGate accountant>
      <h1 className="text-xl font-bold mb-4">設定</h1>
      <section id="rules" className="scroll-mt-4"><Rules /></section>
    </RoleGate>
  );
}
