"use client";

import { RoleGate } from '../role-gate';
import Rules from './sections/Rules';
import Members from './sections/Members';
import Emergency from './sections/Emergency';
import Roles from './sections/Roles';

export default function SettingsPage() {
  return (
    <RoleGate accountant>
      <h1 className="text-xl font-bold mb-2">設定</h1>
      <nav className="flex gap-4 mb-4 text-sm text-gray-400">
        <a href="#rules" className="py-2 hover:text-white">規則</a>
        <a href="#members" className="py-2 hover:text-white">成員</a>
        <a href="#emergency" className="py-2 hover:text-white">緊急狀態</a>
        <a href="#roles" className="py-2 hover:text-white">角色</a>
      </nav>
      <section id="rules" className="scroll-mt-4"><Rules /></section>
      <section id="members" className="scroll-mt-4"><Members /></section>
      <section id="emergency" className="scroll-mt-4"><Emergency /></section>
      <section id="roles" className="scroll-mt-4"><Roles /></section>
    </RoleGate>
  );
}
