import { useState, useEffect } from "react";
import { formatDistanceToNow } from "date-fns";
import { FileIcon, Image, Video, FileText, Music, Archive, File, ChevronDown, ChevronUp } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface FileListViewProps {
  files: any[];
  onFileClick: (fileId: number) => void;
  selectedFileIds: number[];
  onSelectionChange: (fileIds: number[]) => void;
}

type SortField = 'filename' | 'fileSize' | 'createdAt' | 'qualityScore';
type SortDirection = 'asc' | 'desc';

export function FileListView({ files, onFileClick, selectedFileIds, onSelectionChange }: FileListViewProps) {
  const [sortField, setSortField] = useState<SortField>('createdAt');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const sortedFiles = [...files].sort((a, b) => {
    let aVal, bVal;
    
    switch (sortField) {
      case 'filename':
        aVal = a.filename.toLowerCase();
        bVal = b.filename.toLowerCase();
        break;
      case 'fileSize':
        aVal = a.fileSize;
        bVal = b.fileSize;
        break;
      case 'createdAt':
        aVal = new Date(a.createdAt).getTime();
        bVal = new Date(b.createdAt).getTime();
        break;
      case 'qualityScore':
        aVal = a.qualityScore || 0;
        bVal = b.qualityScore || 0;
        break;
      default:
        return 0;
    }

    if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
    if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
    return 0;
  });

  const getFileIcon = (mimeType: string, mobile: boolean) => {
    const size = mobile ? "h-4 w-4" : "h-5 w-5";
    if (mimeType.startsWith('image/')) return <Image className={`${size} text-blue-500`} />;
    if (mimeType.startsWith('video/')) return <Video className={`${size} text-purple-500`} />;
    if (mimeType.startsWith('audio/')) return <Music className={`${size} text-green-500`} />;
    if (mimeType.includes('pdf')) return <FileText className={`${size} text-red-500`} />;
    if (mimeType.includes('zip') || mimeType.includes('rar')) return <Archive className={`${size} text-yellow-500`} />;
    return <File className={`${size} text-gray-500`} />;
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  };

  const getQualityBadge = (score: number | null, mobile: boolean) => {
    const className = mobile ? "text-[10px] px-1 py-0" : "";
    if (!score) return <Badge variant="outline" className={className}>Not Scored</Badge>;
    if (score >= 80) return <Badge className={`bg-green-500 ${className}`}>{mobile ? score : `Excellent (${score})`}</Badge>;
    if (score >= 50) return <Badge className={`bg-yellow-500 ${className}`}>{mobile ? score : `Good (${score})`}</Badge>;
    return <Badge className={`bg-red-500 ${className}`}>{mobile ? score : `Poor (${score})`}</Badge>;
  };

  const handleSelectAll = () => {
    if (selectedFileIds.length === files.length) {
      onSelectionChange([]);
    } else {
      onSelectionChange(files.map(f => f.id));
    }
  };

  const handleSelectFile = (fileId: number) => {
    if (selectedFileIds.includes(fileId)) {
      onSelectionChange(selectedFileIds.filter(id => id !== fileId));
    } else {
      onSelectionChange([...selectedFileIds, fileId]);
    }
  };

  const SortButton = ({ field, label }: { field: SortField; label: string }) => (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => handleSort(field)}
      className={isMobile ? "h-6 px-1 text-[10px]" : "h-8 px-2 hover:bg-accent"}
    >
      {label}
      {sortField === field && (
        sortDirection === 'asc' 
          ? <ChevronUp className={isMobile ? "ml-0.5 h-3 w-3" : "ml-1 h-4 w-4"} /> 
          : <ChevronDown className={isMobile ? "ml-0.5 h-3 w-3" : "ml-1 h-4 w-4"} />
      )}
    </Button>
  );

  // Mobile: Compact card-based layout
  if (isMobile) {
    return (
      <div className="space-y-1">
        {/* Header with select all */}
        <div className="flex items-center justify-between px-2 py-1 bg-muted/30 rounded">
          <label className="flex items-center gap-1.5 cursor-pointer">
            <Checkbox
              checked={selectedFileIds.length === files.length && files.length > 0}
              onCheckedChange={handleSelectAll}
              className="h-3.5 w-3.5"
            />
            <span className="text-[10px] text-muted-foreground">Select All</span>
          </label>
          <div className="flex items-center gap-1">
            <SortButton field="filename" label="Name" />
            <SortButton field="createdAt" label="Date" />
            <SortButton field="fileSize" label="Size" />
          </div>
        </div>

        {/* File list */}
        {sortedFiles.map((file) => (
          <div
            key={file.id}
            className={`flex items-center gap-2 p-2 rounded border ${
              selectedFileIds.includes(file.id) ? 'border-primary bg-primary/5' : 'border-border'
            } cursor-pointer transition-colors`}
            onClick={(e) => {
              if ((e.target as HTMLElement).closest('[data-checkbox]')) return;
              onFileClick(file.id);
            }}
          >
            {/* Small checkbox */}
            <div data-checkbox onClick={(e) => e.stopPropagation()}>
              <Checkbox
                checked={selectedFileIds.includes(file.id)}
                onCheckedChange={() => handleSelectFile(file.id)}
                className="h-3.5 w-3.5"
              />
            </div>

            {/* File icon */}
            {getFileIcon(file.mimeType, true)}

            {/* File info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1">
                <span className="text-xs font-medium truncate">{file.title || file.filename}</span>
                {file.enrichmentStatus === 'enriched' && (
                  <span className="text-[8px] text-green-500">✓</span>
                )}
              </div>
              <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                <span>{file.mimeType.split('/')[1]?.toUpperCase()}</span>
                <span>•</span>
                <span>{formatFileSize(file.fileSize)}</span>
              </div>
            </div>

            {/* Quality badge */}
            {getQualityBadge(file.qualityScore, true)}
          </div>
        ))}

        {files.length === 0 && (
          <div className="p-8 text-center text-muted-foreground text-sm">
            No files found
          </div>
        )}
      </div>
    );
  }

  // Desktop: Table layout
  return (
    <div className="border rounded-lg overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-muted/50 border-b">
            <tr>
              <th className="w-12 p-3 text-left">
                <Checkbox
                  checked={selectedFileIds.length === files.length && files.length > 0}
                  onCheckedChange={handleSelectAll}
                />
              </th>
              <th className="p-3 text-left">
                <SortButton field="filename" label="Name" />
              </th>
              <th className="p-3 text-left">Type</th>
              <th className="p-3 text-left">
                <SortButton field="fileSize" label="Size" />
              </th>
              <th className="p-3 text-left">
                <SortButton field="qualityScore" label="Quality" />
              </th>
              <th className="p-3 text-left">
                <SortButton field="createdAt" label="Date Added" />
              </th>
              <th className="p-3 text-left">Enrichment</th>
            </tr>
          </thead>
          <tbody>
            {sortedFiles.map((file) => (
              <tr
                key={file.id}
                className="border-b hover:bg-muted/30 cursor-pointer transition-colors"
                onClick={(e) => {
                  if ((e.target as HTMLElement).closest('input[type="checkbox"]')) return;
                  onFileClick(file.id);
                }}
              >
                <td className="p-3">
                  <Checkbox
                    checked={selectedFileIds.includes(file.id)}
                    onCheckedChange={() => handleSelectFile(file.id)}
                    onClick={(e) => e.stopPropagation()}
                  />
                </td>
                <td className="p-3">
                  <div className="flex items-center gap-3">
                    {getFileIcon(file.mimeType, false)}
                    <div className="flex flex-col">
                      <span className="font-medium">{file.title || file.filename}</span>
                      {file.title && (
                        <span className="text-xs text-muted-foreground">{file.filename}</span>
                      )}
                    </div>
                  </div>
                </td>
                <td className="p-3 text-sm text-muted-foreground">
                  {file.mimeType.split('/')[1]?.toUpperCase()}
                </td>
                <td className="p-3 text-sm">{formatFileSize(file.fileSize)}</td>
                <td className="p-3">{getQualityBadge(file.qualityScore, false)}</td>
                <td className="p-3 text-sm text-muted-foreground">
                  {formatDistanceToNow(new Date(file.createdAt), { addSuffix: true })}
                </td>
                <td className="p-3">
                  {file.enrichmentStatus === 'enriched' ? (
                    <Badge className="bg-green-500">Enriched</Badge>
                  ) : file.enrichmentStatus === 'pending' ? (
                    <Badge variant="outline">Pending</Badge>
                  ) : (
                    <Badge variant="outline">Not Enriched</Badge>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {files.length === 0 && (
        <div className="p-12 text-center text-muted-foreground">
          No files found
        </div>
      )}
    </div>
  );
}
