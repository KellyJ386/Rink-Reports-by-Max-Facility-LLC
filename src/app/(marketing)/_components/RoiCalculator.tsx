"use client";

import { useState } from "react";

function round1(n: number): string {
  return n.toFixed(1);
}

export function RoiCalculator() {
  const [staff, setStaff] = useState(10);
  const [minutes, setMinutes] = useState(15);

  const weeklyHours = (staff * minutes * 5) / 60;
  const savings = weeklyHours * 0.7;

  return (
    <div className="rounded-2xl border border-navy/60 bg-navy/20 p-8 md:p-10">
      <h2 className="text-2xl font-bold mb-2">How much time are you losing?</h2>
      <p className="text-grey mb-8">
        Drag the sliders to see how much paperwork is costing your team.
      </p>

      <div className="space-y-8">
        {/* Staff slider */}
        <div>
          <div className="flex justify-between mb-2">
            <label htmlFor="roi-staff" className="text-sm font-medium text-grey">
              Staff submitting reports daily
            </label>
            <span className="text-sm font-bold text-white">{staff}</span>
          </div>
          <input
            id="roi-staff"
            type="range"
            min={1}
            max={50}
            value={staff}
            onChange={(e) => setStaff(Number(e.target.value))}
            className="w-full accent-green h-2 rounded-full cursor-pointer"
            aria-label="Staff submitting reports daily"
          />
          <div className="flex justify-between text-xs text-grey mt-1">
            <span>1</span>
            <span>50</span>
          </div>
        </div>

        {/* Minutes slider */}
        <div>
          <div className="flex justify-between mb-2">
            <label htmlFor="roi-minutes" className="text-sm font-medium text-grey">
              Minutes per report on paper
            </label>
            <span className="text-sm font-bold text-white">{minutes} min</span>
          </div>
          <input
            id="roi-minutes"
            type="range"
            min={5}
            max={60}
            value={minutes}
            onChange={(e) => setMinutes(Number(e.target.value))}
            className="w-full accent-green h-2 rounded-full cursor-pointer"
            aria-label="Minutes per report on paper"
          />
          <div className="flex justify-between text-xs text-grey mt-1">
            <span>5 min</span>
            <span>60 min</span>
          </div>
        </div>
      </div>

      {/* Result */}
      <div className="mt-10 rounded-xl bg-darkbg border border-green/30 p-6">
        <p className="text-grey text-sm mb-1">Your team spends</p>
        <p className="text-3xl font-bold text-white mb-1">
          <span className="text-yellow">{round1(weeklyHours)} hours/week</span> on paperwork
        </p>
        <p className="text-grey text-sm mt-4 mb-1">RinkReports can give you back</p>
        <p className="text-3xl font-bold">
          <span className="text-green">{round1(savings)} hours/week</span>
        </p>
        <p className="text-xs text-grey mt-3">
          Estimate based on 70% time reduction from digitizing and automating report workflows.
        </p>
      </div>
    </div>
  );
}
