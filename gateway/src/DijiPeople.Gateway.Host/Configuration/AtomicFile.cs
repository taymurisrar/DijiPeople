using System.Text;

namespace DijiPeople.Gateway.Configuration;

/// <summary>
/// Write-then-replace file writes.
///
/// A gateway can lose power mid-write. Writing straight into the target would
/// leave a truncated identity or settings file behind, and a gateway that cannot
/// read its own identity is a gateway that has to be re-paired on site. Writing
/// to a sibling temp file and then replacing means the target is always either
/// the old complete content or the new complete content.
/// </summary>
internal static class AtomicFile
{
    public static void WriteAllText(string path, string content) =>
        WriteAllBytes(path, new UTF8Encoding(false).GetBytes(content));

    public static void WriteAllBytes(string path, byte[] content)
    {
        var directory = Path.GetDirectoryName(Path.GetFullPath(path));
        if (!string.IsNullOrEmpty(directory))
        {
            Directory.CreateDirectory(directory);
        }

        var temporary = path + ".tmp";

        using (var stream = new FileStream(
                   temporary,
                   FileMode.Create,
                   FileAccess.Write,
                   FileShare.None))
        {
            stream.Write(content, 0, content.Length);
            // Without this the replace below can be durable while the content
            // it points at is still in the page cache.
            stream.Flush(flushToDisk: true);
        }

        if (File.Exists(path))
        {
            // Replace keeps the destination's ACLs, which is what preserves the
            // restricted permissions the installer applied to the credential.
            File.Replace(temporary, path, destinationBackupFileName: null);
        }
        else
        {
            File.Move(temporary, path);
        }
    }
}
