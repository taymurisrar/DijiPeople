using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace DijiPeople.Gateway.Cloud;

/// <summary>
/// Reads the API's error <c>message</c>, which is a string for most failures and
/// an array of strings when validation rejects several fields at once. Both
/// collapse to one readable line so error handling has a single shape.
/// </summary>
internal sealed class JsonElementOrStringConverter : JsonConverter<JsonElementOrString>
{
    public override JsonElementOrString Read(
        ref Utf8JsonReader reader,
        Type typeToConvert,
        JsonSerializerOptions options)
    {
        if (reader.TokenType == JsonTokenType.String)
        {
            return new JsonElementOrString { Value = reader.GetString() ?? string.Empty };
        }

        if (reader.TokenType == JsonTokenType.StartArray)
        {
            var builder = new StringBuilder();
            while (reader.Read() && reader.TokenType != JsonTokenType.EndArray)
            {
                if (reader.TokenType != JsonTokenType.String) continue;
                if (builder.Length > 0) builder.Append("; ");
                builder.Append(reader.GetString());
            }

            return new JsonElementOrString { Value = builder.ToString() };
        }

        // Anything else is skipped rather than throwing: failing to parse an
        // error body must not replace the real failure with a parse failure.
        reader.Skip();
        return new JsonElementOrString();
    }

    public override void Write(
        Utf8JsonWriter writer,
        JsonElementOrString value,
        JsonSerializerOptions options) => writer.WriteStringValue(value.Value);
}
