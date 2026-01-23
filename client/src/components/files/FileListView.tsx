import { useState } from "react";
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

  const getFileIcon = (mimeType: string) => {
    if (mimeType.startsWith('image/')) return <Image className="h-5 w-5 text-blue-500" />;
    if (mimeType.startsWith('video/')) return <Video className="h-5 w-5 text-purple-500" />;
    if (mimeType.startsWith('audio/')) return <Music className="h-5 w-5 text-green-500" />;
    if (mimeType.includes('pdf')) return <FileText className="h-5 w-5 text-red-500" />;
    if (mimeType.includes('zip') || mimeType.includes('rar')) return <Archive className="h-5 w-5 text-yellow-500" />;
    return <File className="h-5 w-5 text-gray-500" />;
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  };

  const getQualityBadge = (score: number | null) => {
    if (!score) return <Badge variant="outline">Not Scored</Badge>;
    if (score >= 80) return <Badge className="bg-green-500">Excellent ({score})</Badge>;
    if (score >= 50) return <Badge className="bg-yellow-500">Good ({score})</Badge>;
    return <Badge className="bg-red-500">Poor ({score})</Badge>;
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
      className="h-8 px-2 hover:bg-accent"
    >
      {label}
      {sortField === field && (
        sortDirection === 'asc' ? <ChevronUp className="ml-1 h-4 w-4" /> : <ChevronDown className="ml-1 h-4 w-4" />
      )}
    </Button>
  );

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
                    {getFileIcon(file.mimeType)}
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
                <td className="p-3">{getQualityBadge(file.qualityScore)}</td>
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
