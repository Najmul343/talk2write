import React from 'react';

interface ResultCardProps {
  text: string;
  type: 'TRANSCRIPT' | 'SUMMARY';
  onDelete?: () => void;
  index?: number;
}

export const ResultCard: React.FC<ResultCardProps> = ({ text, type, onDelete, index }) => {
  const handleCopy = () => {
    navigator.clipboard.writeText(text);
  };

  const isSummary = type === 'SUMMARY';

  return (
    <div className={`w-full max-w-md rounded-2xl shadow-sm border overflow-hidden animate-fade-in-up mb-4 ${isSummary ? 'bg-indigo-50 border-indigo-100' : 'bg-white border-slate-100'}`}>
      <div className={`px-4 py-2 border-b flex justify-between items-center ${isSummary ? 'bg-indigo-100 border-indigo-200' : 'bg-slate-50 border-slate-100'}`}>
        <div className="flex items-center gap-2">
          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${isSummary ? 'bg-indigo-600 text-white' : 'bg-slate-200 text-slate-600'}`}>
            {isSummary ? 'SUMMARY' : `#${(index ?? 0) + 1}`}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button 
            onClick={handleCopy}
            className="text-xs font-medium uppercase tracking-wide px-2 py-1 rounded transition-colors text-slate-500 hover:bg-slate-200"
          >
            Copy
          </button>
          {onDelete && (
            <button 
              onClick={onDelete}
              className="text-slate-400 hover:text-red-500 p-1 rounded hover:bg-red-50 transition-colors"
              title="Delete segment"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          )}
        </div>
      </div>
      <div className="p-4">
        <p className="text-xl text-right leading-loose text-slate-800 font-serif" dir="rtl">
          {text}
        </p>
      </div>
    </div>
  );
};
